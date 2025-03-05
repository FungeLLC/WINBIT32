import React, { useEffect, useMemo, useCallback, useRef, useState } from 'react';
import { useIsolatedState } from '../../win/includes/customHooks';
import DataTable from 'react-data-table-component';
import { useWindowSKClient } from '../../contexts/SKClientProviderManager';
import { parseIniData } from './helpers/handlers';
import './styles/Exora.css';
import { getQuotes } from './helpers/quotes';
import { handleSwap } from './helpers/handlers';
import { COLUMN_MAPPING, updateIniField, isQuoteField, canGetQuote, getTokenBalance, formatTokenBalance } from './helpers/swapini';
import { HeaderCell, LetterCell, ActionButton, SpreadsheetContainer, customStyles, EditBar, EditInput, RowNumber, InnerScrollContainer, OuterScrollContainer, EditInputBase, EditSelect } from './styles/Exora';
import TokenChooserDialog from './TokenChooserDialog';
import { FaEllipsisH } from 'react-icons/fa';
import { chooseWalletForToken } from './helpers/handlers';
import {
  Chain,
  ChainId,
  getGasAsset,
} from "@swapkit/helpers";
import { SwapKitApi } from "@swapkit/api";
import { fetchTokenPrices, fetchMultipleTokenPrices } from './includes/tokenUtils';
import useExoraColumns from './hooks/useExoraColumns';
import useExoraActions from './hooks/useExoraActions';
import { copyToCSV, generateIni, handleClipboardPaste} from './helpers/clipboard';
import { saveToFile, loadFromFile, parseCsvRow  } from './helpers/fileOps';
import { formatBalance, formatBalanceWithUSD, checkTxnStatus, getTxnDetails } from './helpers/transaction';
import { initialRowState } from './helpers/constants';
import { handleExecuteAll, optimizeForGas, hasRowTxData } from './hooks/handleExecuteAll';

// Add this helper function near the top with other utility functions
export const hasData = (row) => {
  if (!row || row.isEmpty) return false;

  return Object.entries(COLUMN_MAPPING)
    .some(([field, mapping]) => {
      if (field === 'swapid') return false; // Ignore swapid
      if (field === 'slippage') return false; // Ignore slippage

      const value = row[field];
      if (!value) return false;

      switch (mapping.editor) {
        case 'tokenSelect':
          return !!value.identifier;
        case 'number':
          return value !== 0 && !isNaN(value);
        case 'select':
          return !!value;
        case 'address':
          return value.trim() !== '';
        case 'readonly':
          return false; // Ignore readonly fields
        default:
          return typeof value === 'string' ? value.trim() !== '' : !!value;
      }
    });
};

// Add near the top with other helper functions, after hasData
const getActiveChains = (rows) => {
  const chains = new Set();
  rows.forEach(row => {
    if (row.isEmpty) return;
    if (row.fromToken?.chain) chains.add(row.fromToken.chain);
    if (row.toToken?.chain) chains.add(row.toToken.chain);

    // Also add gas asset chains if needed
    const gasAsset = row.fromToken?.chain ? getGasAsset({ chain: row.fromToken.chain }) : null;
    if (gasAsset?.chain) chains.add(gasAsset.chain);
  });
  return Array.from(chains);
};

const EMPTY_ROW_COUNT = 25;

// Add this near the top with other utility functions
const rateLimiter = {
  lastCall: 0,
  minDelay: 2000, // 2 seconds between calls
  async waitForNext() {
    const now = Date.now();
    const timeSinceLastCall = now - this.lastCall;
    if (timeSinceLastCall < this.minDelay) {
      await new Promise(resolve => setTimeout(resolve, this.minDelay - timeSinceLastCall));
    }
    this.lastCall = Date.now();
  }
};

// Move updateBalances function definition up here, before the component
const updateBalances = async (row, walletBalances, wallets) => {
  if (!row || !row.fromToken || !row.toToken || row.isEmpty) return null;

  const fromChain = row.fromToken.chain;
  const toChain = row.toToken.chain;
  const gasAsset = getGasAsset({ chain: fromChain });

  return {
    ...row,
    fromToken: {
      ...row.fromToken,
      balance: getTokenBalance(row.fromToken, wallets),
      usdValue: walletBalances[fromChain]?.prices?.[row.fromToken.identifier.toLowerCase()] || 0
    },
    toToken: {
      ...row.toToken,
      balance: getTokenBalance(row.toToken, wallets),
      usdValue: walletBalances[toChain]?.prices?.[row.toToken.identifier.toLowerCase()] || 0
    },
    gasAsset: gasAsset,
    gasBalance: getTokenBalance(gasAsset, wallets)
  };
};

const Exora = ({ providerKey, windowId, programData, onOpenWindow, onMenuAction, windowA, windowName, }) => {
  const { skClient, tokens, wallets, chainflipBroker, refreshBalance, providers } = useWindowSKClient(providerKey);
  const [rows, setRows] = useIsolatedState(windowId, 'rows', []);
  const [selectedRow, setSelectedRow] = useIsolatedState(windowId, 'selectedRow', null);
  const [selectedCell, setSelectedCell] = useIsolatedState(windowId, 'selectedCell', null);
  const [iniExpanded, setIniExpanded] = useIsolatedState(windowId, 'iniExpanded', false);
  const [compactView, setCompactView] = useIsolatedState(windowId, 'compactView', true);
  const [editValue, setEditValue] = useIsolatedState(windowId, 'editValue', '');
  const [isEditing, setIsEditing] = useIsolatedState(windowId, 'isEditing', false);
  const [isTokenDialogOpen, setIsTokenDialogOpen] = useIsolatedState(windowId, 'isTokenDialogOpen', false);
  const [currentTokenSetter, setCurrentTokenSetter] = useIsolatedState(windowId, 'currentTokenSetter', null);
  const inputRef = useRef(windowId + '-search-text');

  const editInputRef = useRef(null);

  // 1. First add a new state to track balance updates
  const [balanceUpdateQueue, setBalanceUpdateQueue] = useIsolatedState(windowId, 'balanceUpdateQueue', new Set());
  const [lastBalanceUpdate, setLastBalanceUpdate] = useIsolatedState(windowId, 'lastBalanceUpdate', {});
  const [lastWalletUpdate, setLastWalletUpdate] = useState({});
  const [walletBalances, setWalletBalances] = useState({});

  // Add state variables for transaction tracking
  const [txnTimers, setTxnTimers] = useIsolatedState(windowId, 'txnTimers', {});
  const txnTimersRef = useRef(txnTimers);

  // Add this near other state declarations
  const selectedRowRef = useRef(null);
  const rowsRef = useRef(null);
  const handleMenuActionRef = useRef(null);
  const walletsRef = useRef(wallets);

  // Update ensureSelection to preserve cell selection when reselecting row
  const ensureSelection = useCallback((row, field) => {
    if (!row?.swapid) return;

    // Get fresh row data from state
    const currentRow = rows.find(r => r.swapid === row.swapid);
    if (!currentRow) return;

    // Keep previous cell if reselecting same row and no new field specified
    const newField = field || (selectedRow?.swapid === row.swapid ? selectedCell : null);

    setSelectedRow(currentRow);
    setSelectedCell(newField);
    selectedRowRef.current = currentRow;
    rowsRef.current = rows;

    // Only update edit value if we have a field
    if (newField) {
      const value = COLUMN_MAPPING[newField]?.format?.(currentRow[newField], currentRow)
        || currentRow[newField]
        || '';
      setEditValue(value);
    }
  }, [rows, selectedRow, selectedCell, setSelectedRow, setSelectedCell, setEditValue]);

  // Get array of editable fields in display order
  const getEditableFields = () => {
    // Get all field names that have editors
    return Object.entries(COLUMN_MAPPING)
      .filter(([_, mapping]) => (
        mapping.editor &&
        mapping.editor !== 'readonly' &&
        (!compactView || mapping.compact)
      ))
      .map(([field]) => field)
      // Add routes column at the end
      .concat(['routes']);
  };

  // Navigate to next/prev cell
  const navigateCell = (direction) => {
    if (!selectedRow || !selectedCell) return;

    const fields = getEditableFields();
    const currentIdx = fields.indexOf(selectedCell);

    let newIdx, newRow;
    switch (direction) {
      case 'left':
        newIdx = currentIdx - 1;
        if (newIdx < 0) return;
        break;
      case 'right':
        newIdx = currentIdx + 1;
        if (newIdx >= fields.length) return;
        break;
      case 'up':
      case 'down':
        const rowIdx = rows.findIndex(r => r.swapid === selectedRow.swapid);
        const newRowIdx = direction === 'up' ? rowIdx - 1 : rowIdx + 1;
        if (newRowIdx < 0 || newRowIdx >= rows.length) return;
        newRow = rows[newRowIdx];
        break;
    }

    if (newRow) {
      setSelectedRow(newRow);
    }
    if (newIdx !== undefined) {
      setSelectedCell(fields[newIdx]);
    }

    // After setting new row/cell, scroll into view
    setTimeout(() => {
      try {
        if (newRow) {
          const cell = document.querySelector('.cell_' + selectedCell + '_' + newRow.swapid);
          if (cell) {
            cell.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
          }
        } else if (newIdx !== undefined) {
          const cell = document.querySelector('.cell_' + fields[newIdx] + '_' + selectedRow.swapid);
          if (cell) {
            cell.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
          }
        }
      } catch (e) {
        console.log(e);
      }
    }, 0);
  };

  // Add keyboard event handlers
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (isEditing) {
        if (e.key === 'Enter') {
          commitEdit();
        } else if (e.key === 'Escape') {
          cancelEdit();
        }
        return;
      }

      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault();
          navigateCell('left');
          break;
        case 'ArrowRight':
          e.preventDefault();
          navigateCell('right');
          break;
        case 'ArrowUp':
          e.preventDefault();
          navigateCell('up');
          break;
        case 'ArrowDown':
          e.preventDefault();
          navigateCell('down');
          break;
        case 'Tab':
          e.preventDefault();
          navigateCell(e.shiftKey ? 'left' : 'right');
          break;
        case 'F2':
          e.preventDefault();
          if (selectedCell && selectedRow) {
            setIsEditing(true);
            setEditValue(getSelectedValue());
            setTimeout(() => editInputRef.current.focus(), 0);
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedRow, selectedCell, isEditing]);

  // Add keyboard handler for direct number input
  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      // Only handle if cell is selected but not editing
      if (selectedRow && selectedCell && !isEditing) {
        const mapping = COLUMN_MAPPING[selectedCell];
        if (mapping?.editor === 'number' && /^\d$/.test(e.key)) {
          e.preventDefault();
          startEditing(selectedRow, selectedCell, true);
          setEditValue(e.key);
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [selectedRow, selectedCell, isEditing]);

  // Generate empty placeholder rows
  const getEmptyRows = () => Array(EMPTY_ROW_COUNT).fill(null).map((_, i) => ({
    ...initialRowState,
    swapid: `empty-${i}`,
    isEmpty: true
  }));

  // Combine real rows with empty ones
  const getAllRows = useMemo(() => {
    // Check if we need to add a spare row
    const needsSpareRow = rows.length === 0 || hasData(rows[rows.length - 1]);

    if (needsSpareRow) {
      setRows(current => {
        current.push({
          ...initialRowState,
          swapid: Date.now(),  // Use normal timestamp ID instead of spare- prefix
          isEmpty: false
        });
        return current;
      });
    }

    return [...rows, ...Array(EMPTY_ROW_COUNT).fill(null).map((_, i) => ({
      ...initialRowState,
      swapid: `empty-${i}`,
      isEmpty: true
    }))];
  }, [rows]);

  const getLetterForIndex = (index) =>
    String.fromCharCode(65 + index);

  // Use parseIniData from handlers to process row data
  const updateRowFromIni = (iniData) => {
    const displayData = { ...initialRowState };
    console.log('updateRowFromIni', iniData);
    displayData.iniData = iniData;

    parseIniData(
      iniData,
      // For fromToken: try to match token from the tokens list, else keep as is.
      (token) => {
        const matched = tokens.find(t => t.identifier.toLowerCase() === token.identifier.toLowerCase());
        displayData.fromToken = matched || token;
      },
      // For toToken: try to match token from the tokens list, else keep as is.
      (token) => {
        const matched = tokens.find(t => t.identifier.toLowerCase() === token.identifier.toLowerCase());
        displayData.toToken = matched || token;
      },
      (amount) => { displayData.amountIn = amount },
      (address) => { displayData.destinationAddress = address },
      (option) => { displayData.feeOption = option },
      (slip) => { displayData.slippage = slip },
      (route) => { displayData.selectedRoute = route },
      () => { }, // setRoutes
      [], // routes array
      tokens,
      (streaming) => { displayData.manualStreamingSet = streaming },
      (interval) => { displayData.streamingInterval = interval },
      (numSwaps) => { displayData.streamingNumSwaps = numSwaps }
    );

    return displayData;
  };

  // Fix the row selection effect to prevent loops
  useEffect(() => {
    if (!selectedRow) return; // Add early return

    setRows(current => {
      // Only update if needed
      if (!current.some(r => r.selected !== (r.swapid === selectedRow.swapid))) {
        return current;
      }
      return current.map(r => ({
        ...r,
        selected: r.swapid === selectedRow.swapid
      }));
    });
  }, [selectedRow?.swapid]); // Only depend on the ID, not the whole row

  // Fix the data refresh effect
  useEffect(() => {
    if (!selectedRow?.swapid) return; // Add early return

    setRows(current => {
      const index = current.findIndex(r => r.swapid === selectedRow.swapid);
      if (index === -1) return current;

      // Only update if data has changed
      const updatedRow = {
        ...current[index],
        ...selectedRow
      };

      if (safeStringify(current[index]) === safeStringify(updatedRow)) {
        return current;
      }

      const newRows = [...current];
      newRows[index] = updatedRow;
      return newRows;
    });
  }, [selectedRow?.swapid, selectedRow?.fromToken, selectedRow?.toToken]); // Only depend on specific fields

  // Fix the balance update interval
  useEffect(() => {
    if (!selectedRow?.swapid || selectedRow.isEmpty) return;

    // Initial balance update
    updateBalances(selectedRow, wallets, skClient).then(updatedRow => {
      if (updatedRow && safeStringify(updatedRow) !== safeStringify(selectedRow)) {
        setSelectedRow(prev => ({
          ...prev,
          fromToken: {
            ...prev.fromToken,
            balance: updatedRow.fromToken?.balance
          },
          toToken: {
            ...prev.toToken,
            balance: updatedRow.toToken?.balance
          },
          gasBalance: updatedRow.gasBalance
        }));
      }
    });

    const updateInterval = setInterval(() => {
      updateBalances(selectedRow, wallets, skClient).then(updatedRow => {
        if (updatedRow && safeStringify(updatedRow) !== safeStringify(selectedRow)) {
          setSelectedRow(prev => ({
            ...prev,
            fromToken: {
              ...prev.fromToken,
              balance: updatedRow.fromToken?.balance
            },
            toToken: {
              ...prev.toToken,
              balance: updatedRow.toToken?.balance
            },
            gasBalance: updatedRow.gasBalance
          }));
        }
      });
    }, 15000);

    return () => clearInterval(updateInterval);
  }, [selectedRow?.swapid]); // Only depend on the row ID

  const handleEdit = useCallback((row) => {
    // Always get latest row data from rows state
    const currentRow = rows.find(r => r.swapid === row.swapid) || row;

    if (!currentRow.swapid) {
      currentRow.swapid = Date.now();
    }

    onOpenWindow('exchange.exe', {
      initialIniData: currentRow.iniData,
      editMode: true,
      onSave: (newIniData, otherData) => {
        setRows(current => {
          const currentIndex = current.findIndex(r => r.swapid === row.swapid);
          if (currentIndex === -1) return current;

          const updatedRows = [...current];

          // Update current row
          updatedRows[currentIndex] = {
            ...row,
            iniData: newIniData,
            route: otherData.route,
            ...updateRowFromIni(newIniData),
            expectedOut: otherData.expectedOut,
            status: 'Ready',
            swapid: row.swapid
          };

          return updatedRows;
        });
        // Re-select row after save
        setTimeout(() => ensureSelection(currentRow, selectedCell), 0);
        return true;
      }
    });
  }, [rows, onOpenWindow, ensureSelection, selectedCell]);

  // Handle click on any row
  const handleRowClick = (row) => {
    console.log('handleRowClick', row);
    if (!row.isEmpty) {
      //select the row
      handleRowSelect(row);
      return;
    }

    const newRow = {
      ...initialRowState,
      swapid: Date.now()
    };

    setRows(current => {
      // Find first empty row index
      const emptyIndex = current.findIndex(r => r.isEmpty);
      if (emptyIndex === -1) return [...current, newRow];

      // Insert before empty rows
      return [
        ...current.slice(0, emptyIndex),
        newRow,
        ...current.slice(emptyIndex)
      ];
    });

    handleEdit(newRow);
  };

  useEffect(() => {
    if (selectedRow?.swapid && selectedCell) {
      //remove border from all cells
      document.querySelectorAll('.cell_inner').forEach((cell) => {
        cell.style.border = 'none';
      });
      console.log('selectedCell', selectedCell);

      //add border to selected cell
      try {
        const cells = document.querySelectorAll('.cell_' + selectedCell + '_' + selectedRow.swapid);
        if (cells.length > 0) {
          cells.forEach((cell) => {
            cell.style.border = '1px solid #000';
          });
        }
      } catch (error) {
        console.error('Error setting cell border:', error);
      }
    }
  }, [selectedRow?.swapid, selectedCell]);

  useEffect(() => { 
    walletsRef.current = wallets;
  }, [wallets]);

  const handleMenuAction = useCallback((action) => {
    console.log('handleMenuAction', action, rows);
    // Use the latest selected row from state
    const currentRow = selectedRowRef.current || selectedRow;
    const currentRows = rowsRef.current || rows;
    switch (action) {
      case 'copyCell': {
        if (selectedCell && currentRow) {
          const cellValue = getSelectedValue();
          navigator.clipboard.writeText(cellValue);
        }
        break;
      }
      case 'copyRow': {
        // Copy the row's iniData (in ini style) instead of serializing the entire object
        const copiedData = selectedRow?.iniData || "";
        navigator.clipboard.writeText(copiedData);
        break;
      }
      case 'copyAll': {
        const validRows = currentRows.filter(r => !r.isEmpty && hasData(r)); // Only copy non-empty rows
        // For CSV saving, exclude metadata by passing false as third parameter
        const csv = copyToCSV(validRows, COLUMN_MAPPING, false);
        navigator.clipboard.writeText(csv);
        break;
      }
      case 'paste': {
        navigator.clipboard.readText().then((clipboardText) => {
          if (!clipboardText.trim()) return;
          let newRows = [];

          if (clipboardText.includes('=') && clipboardText.includes('\n')) {
            // Handle INI format
            newRows = [{ 
              ...initialRowState,
              iniData: clipboardText,
              swapid: Date.now(),
              isEmpty: false
            }];
          } else if (clipboardText.includes(',')) {
            // Parse CSV format - returns array of rows
            newRows = parseCsvRow(clipboardText, COLUMN_MAPPING, tokens).map(rowData => ({
              ...initialRowState,
              ...rowData,
              swapid: Date.now() + Math.random(),
              isEmpty: false
            }));
          }

          if (newRows.length > 0) {
            // If selected row is empty, replace it, otherwise add new rows
            if (selectedRow?.isEmpty) {
              setRows(current => [
                ...current.slice(0, current.findIndex(r => r.swapid === selectedRow.swapid)),
                ...newRows,
                ...current.slice(current.findIndex(r => r.swapid === selectedRow.swapid) + 1)
              ]);
            } else {
              setRows(current => [...current, ...newRows]);
            }
            // Select the first new row
            ensureSelection(newRows[0], selectedCell);
          }
        });
        break;
      }
      case 'deleteRow': {
        if (currentRow?.swapid) {
          setRows(current => {
            const index = current.findIndex(r => r.swapid === currentRow.swapid);
            const filtered = current.filter(r => r.swapid !== currentRow.swapid);

            // Find next row to select
            let nextRow = null;
            if (filtered.length > 0) {
              // Try to select next row down
              nextRow = filtered[index];
              // If no row below, try row above
              if (!nextRow && index > 0) {
                nextRow = filtered[index - 1];
              }
            }

            // Schedule selection of next row
            if (nextRow) {
              setTimeout(() => {
                ensureSelection(nextRow, selectedCell);
              }, 0);
            } else {
              setSelectedRow(null);
              setSelectedCell(null);
            }

            return filtered;
          });
        }
        break;
      }
      case 'compact': {
        setCompactView(true);
        break;
      }
      case 'showAll': {
        setCompactView(false);
        break;
      }
      case 'saveCSV':
        saveToFile(currentRows, COLUMN_MAPPING, 'csv');
        break;
      case 'saveXLSX':
        saveToFile(currentRows, COLUMN_MAPPING, 'xlsx');
        break;
      case 'openCSV':
      case 'openXLSX': {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.csv,.xlsx';
        input.onchange = async (e) => {
          const file = e.target.files[0];
          if (!file) return;

          try {
            const loadedRows = await loadFromFile(file, tokens, COLUMN_MAPPING, initialRowState, setRows);
            setRows(current => [...loadedRows.map(r => ({
              ...initialRowState,
              ...r,
              swapid: Date.now() + Math.random(),
              isEmpty: false
            }))]);
          } catch (err) {
            console.error('Failed to load file:', err);
          }
        };
        input.click();
        break;
      }
      default:
        break;
    }
  }, [rows, selectedRow, selectedCell, setCompactView, setRows, ensureSelection, tokens]);


  const menu = useMemo(
    () => [
      {
        label: "File",
        submenu: [
          { label: "Open...", action: "openCSV" },
          { label: "Save As CSV", action: "saveCSV" },
          { label: "Save As Excel", action: "saveXLSX" },
        ],
      },
      {
        label: "Edit",
        submenu: [
          { label: "Copy Cell", action: "copyCell" },
          { label: "Copy Row", action: "copyRow" },
          { label: "Copy All", action: "copyAll" },
          { label: "Paste", action: "paste" },
          { label: "Delete Row", action: "deleteRow" },
        ],
      },
      {
        label: "Columns",
        submenu: [
          { label: "Compact", action: "compact" },
          { label: "Show All", action: "showAll" },
        ],
      },
    ],
    []
  );


  // Replace updateBalances function
  const updateBalances = async (row) => {
    if (!row || !row.fromToken || !row.toToken || row.isEmpty) return null;

    const fromChain = row.fromToken.chain;
    const toChain = row.toToken.chain;
    const gasAsset = getGasAsset({ chain: fromChain });

    // Use cached balances if available and fresh
    const fromWalletData = walletBalances[fromChain];
    const toWalletData = walletBalances[toChain];
    const now = Date.now();

    if (!fromWalletData || !toWalletData ||
      now - fromWalletData.timestamp > 60000 ||
      now - toWalletData.timestamp > 60000) {
      return row;
    }

    // Find the right wallet and balance for each token
    const fromBalance = fromWalletData.balance.find(b =>
      (b.isSynthetic !== true &&
        (b.chain + '.' + b.ticker.toUpperCase() === row.fromToken.identifier.toUpperCase() ||
          b.chain + '.' + b.symbol.toUpperCase() === row.fromToken.identifier.toUpperCase())) ||
      (b.isSynthetic === true && b.symbol.toUpperCase() === row.fromToken.identifier.toUpperCase())
    );

    const toBalance = toWalletData.balance.find(b =>
      (b.isSynthetic !== true &&
        (b.chain + '.' + b.ticker.toUpperCase() === row.toToken.identifier.toUpperCase() ||
          b.chain + '.' + b.symbol.toUpperCase() === row.toToken.identifier.toUpperCase())) ||
      (b.isSynthetic === true && b.symbol.toUpperCase() === row.toToken.identifier.toUpperCase())
    );

    // Apply cached balances and prices
    const newRow = {
      ...row,
      fromToken: {
        ...row.fromToken,
        balance: fromBalance || null,
        usdValue: fromWalletData.prices[row.fromToken.identifier.toLowerCase()] || 0
      },
      toToken: {
        ...row.toToken,
        balance: toBalance || null,
        usdValue: toWalletData.prices[row.toToken.identifier.toLowerCase()] || 0
      }
    };

    // Add gas balance if needed
    if (gasAsset) {
      const gasId = `${gasAsset.chain}.${gasAsset.symbol}`.toLowerCase();
      const gasBalance = fromWalletData.balance.find(b =>
        b.chain === gasAsset.chain &&
        (b.symbol === gasAsset.symbol || b.ticker === gasAsset.symbol)
      );
      newRow.gasBalance = gasBalance || null;
      newRow.gasToken = {
        ...gasAsset,
        balance: gasBalance,
        usdValue: fromWalletData.prices[gasId] || 0
      };
    }

    return newRow;
  };

  // Move cell update logic to component level
const handleCellUpdate = useCallback(async (row, field, value) => {
  // Get latest row data and update token balances immediately if token changed
  const currentRow = rows.find(r => r.swapid === row.swapid);
  if (!currentRow) return;

  // Special handling for token selection
  if (field === 'fromToken' || field === 'toToken') {
    // Update the token first
    setRows(current => 
      current.map(r => r.swapid === currentRow.swapid 
        ? { ...r, [field]: value }
        : r
      )
    );
    



    // Then immediately fetch updated balances
    const updatedBalances = await updateBalances(
      { ...currentRow, [field]: value },
      walletBalances,
      refreshBalance
    );
    
    if (updatedBalances) {
      setRows(current =>
        current.map(r => r.swapid === currentRow.swapid
          ? {
              ...r,
              fromToken: field === 'fromToken' ? {
                ...value,
                balance: updatedBalances.fromToken?.balance,
                usdValue: updatedBalances.fromToken?.usdValue
              } : r.fromToken,
              toToken: field === 'toToken' ? {
                ...value,
                balance: updatedBalances.toToken?.balance,
                usdValue: updatedBalances.toToken?.usdValue
              } : r.toToken,
              gasBalance: updatedBalances.gasBalance
            }
          : r
        )
      );
    }
  }

  const mapping = COLUMN_MAPPING[field];

  if(!mapping) {
    console.error('Invalid field:', field);
    return;
  }

  let newValue = value;

  // Handle token selection differently  
  if (mapping?.editor === 'tokenSelect') {
    newValue = value; // Keep the full token object
  } else if (mapping?.parse) {
    newValue = mapping.parse(value);
  }

  // Handle streaming parameters
  const isStreamingUpdate = field === 'streamingInterval' || field === 'streamingNumSwaps';
  const clearRouteData = isQuoteField(field) && !isStreamingUpdate;

  // Update INI data
  const newIniData = updateIniField(currentRow.iniData, mapping.iniField, 
    mapping.editor === 'tokenSelect' ? value?.identifier : value);

  // Update row state with new value
  setRows(current => 
    current.map(r => 
      r.swapid === currentRow.swapid 
        ? {
            ...r,
            [field]: newValue,
            iniData: newIniData,
            // Clear route data only if it's a non-streaming quote field
            ...(clearRouteData ? {
              routes: [],
              route: null,
              selectedRoute: null,
              expectedOut: '',
              gasFee: '',
              status: 'Quote Required'
            } : isStreamingUpdate ? {
              // For streaming updates, preserve route but mark for requote
              status: 'Quote Required - Streaming Parameters Changed',
              route: r.route ? {
                ...r.route,
                streamingSwap: true,
                streamingBlocks: field === 'streamingInterval' ? newValue : r.streamingInterval,
                streamingQuantity: field === 'streamingNumSwaps' ? newValue : r.streamingNumSwaps
              } : null
            } : {})
          }
        : r
    )
  );

  // Get updated row
  const updatedRow = {...currentRow, [field]: newValue};

  // Auto-quote if required fields are present
  if ((isQuoteField(field) || isStreamingUpdate) && canGetQuote(updatedRow)) {
    // Small delay to allow UI to update
    setTimeout(() => {
      const freshRow = rows.find(r => r.swapid === updatedRow.swapid);
      if (freshRow) {
        handleQuote(freshRow);
      }
    }, 100);
  }
}, [rows, handleQuote, updateBalances]); // Add other deps as needed



  // Memoize handleCellSelect
  const handleCellSelect = useCallback((row, field) => {
    if (!row?.swapid || !field) return;

    // Get latest row data
    const currentRow = rows.find(r => r.swapid === row.swapid);
    if (!currentRow) return;

    // Don't clear cell selection when clicking same cell
    if (selectedRow?.swapid === currentRow.swapid && selectedCell === field) {
      return;
    }

    ensureSelection(currentRow, field);
  }, [rows, selectedRow?.swapid, selectedCell, ensureSelection]);

  // Get selected cell value for edit box
  const getSelectedValue = () => {
    if (!selectedRow || !selectedCell) return '';
    const mapping = COLUMN_MAPPING[selectedCell];
    return mapping?.format
      ? mapping.format(selectedRow[selectedCell], selectedRow)
      : selectedRow[selectedCell];
  };

  const handleAddRow = () => {
    const newRow = {
      ...initialRowState,
      swapid: Date.now()
    };
    setRows(current => [...current, newRow]);
    handleEdit(newRow);
  };

  // Replace handleTokenSelect and related functions
  const handleTokenSelect = useCallback((token, currentTokenSetter, closeTokenDialog) => {
    const wallets = walletsRef.current;
    if (currentTokenSetter) {
      // First update the token with its balance
      const tokenWithBalance = {
        ...token,
        balance: getTokenBalance(token, wallets)
      };
      
      currentTokenSetter(tokenWithBalance);
      
      const currentRow = rows.find(r => r.swapid === selectedRow?.swapid);
      if (currentRow) {
        const updatedField = selectedCell;
        
        // Update the row with the new token and its balance
        setRows(prev => prev.map(r => 
          r.swapid === currentRow.swapid 
            ? {
                ...r,
                [updatedField]: tokenWithBalance,
                ...(updatedField === 'toToken' && {
                  destinationAddress: chooseWalletForToken(token, wallets)?.address || r.destinationAddress,
                  iniData: updateIniField(r.iniData, 'destination', 
                    chooseWalletForToken(token, wallets)?.address || r.destinationAddress)
                }),
                updateKey: Date.now(),
                gasBalance: updatedField === 'fromToken' ? 
                  getTokenBalance(getGasAsset({ chain: token.chain }), wallets) : 
                  r.gasBalance
              }
            : r
        ));

        // If we have enough info for a quote, trigger it
        if (canGetQuote({
          ...currentRow,
          [updatedField]: tokenWithBalance
        })) {
          setTimeout(() => handleQuote({
            ...currentRow,
            [updatedField]: tokenWithBalance
          }), 100);
        }
      }
    }
    closeTokenDialog();
  }, [selectedRow?.swapid, selectedCell, rows, setRows, wallets, handleQuote]);

  const handleNumberInput = (row, field, value) => {
    const mapping = COLUMN_MAPPING[field];
    if (mapping.range) {
      const [min, max] = mapping.range;
      value = Math.max(min, Math.min(max, parseFloat(value)));
    }
    updateCell(row, field, value);
  };

  const handleAddressInput = (row, field, value) => {
    const mapping = COLUMN_MAPPING[field];
    if (mapping.validate && !mapping.validate(value)) {
      return false;
    }
    updateCell(row, field, value);
  };

  const handleSelect = (row, field, value) => {
    const mapping = COLUMN_MAPPING[field];
    if (!mapping.options.includes(value)) {
      return false;
    }
    updateCell(row, field, value);
  };

  // Memoize updateCell
  const updateCell = useCallback((row, field, value) => {
    console.log('updateCell', row, field, value);

    const mapping = COLUMN_MAPPING[field];

    // Handle token selection differently  
    if (mapping.editor === 'tokenSelect') {
      value = value; // Keep the full token object
    } else if (mapping.parse) {
      value = mapping.parse(value);
    }

    // Update INI data
    let newIniData = row.iniData;
    if (mapping.iniField) {
      const lines = newIniData.split('\n');
      const lineIndex = lines.findIndex(l => l.startsWith(`${mapping.iniField}=`));
      // For tokens, use the identifier
      const newValue = mapping.editor === 'tokenSelect' ? value?.identifier : value;
      const newLine = `${mapping.iniField}=${newValue}`;

      if (lineIndex >= 0) {
        lines[lineIndex] = newLine;
      } else {
        lines.push(newLine);
      }
      newIniData = lines.join('\n');
    }

    // Check if this is editing the last non-empty row
    const isLastRow = (currentRows) => {
      const nonEmptyRows = currentRows.filter(r => !r.isEmpty);
      return row.swapid === nonEmptyRows[nonEmptyRows.length - 1]?.swapid;
    };

    setRows(current => {
      const index = current.findIndex(r => r.swapid === row.swapid);
      if (index === -1) return current;

      const updatedRows = [...current];
      const updatedRow = {
        ...row,
        [field]: value,
        iniData: newIniData
      };

      updatedRows[index] = updatedRow;

      // If this edit creates data in the last row, add a new spare row
      if (isLastRow(current) && !hasData(row) && hasData(updatedRow)) {
        updatedRows.push({
          ...initialRowState,
          swapid: Date.now(),
          isEmpty: false
        });
      }

      // Ensure selection stays on updated row
      setTimeout(() => ensureSelection(updatedRow, field), 0);

      return updatedRows;
    });
  }, [setRows, ensureSelection]); // Only depends on setRows

  // Update handleRowSelect to properly sync refs and state
  const handleRowSelect = useCallback((row) => {
    if (!row?.swapid) return;

    // Get latest row data
    const currentRow = rows.find(r => r.swapid === row.swapid);
    if (!currentRow) return;

    // Keep existing field selection when reselecting same row
    const field = selectedRow?.swapid === currentRow.swapid ? selectedCell : null;

    ensureSelection(currentRow, field);
  }, [rows, selectedRow, selectedCell, ensureSelection]);

  const openTokenDialog = (setter) => {
    setCurrentTokenSetter(() => setter);
    setIsTokenDialogOpen(true);
    setIsTokenDialogOpen(true);
  };

  const closeTokenDialog = useCallback(() => {
    setIsTokenDialogOpen(false);

    setCurrentTokenSetter(null);
  }, []);


  // Update tokenChooserDialog usage
  const tokenChooserDialog = useMemo(() => {
    if (isTokenDialogOpen) {
      return <TokenChooserDialog
        isOpen={isTokenDialogOpen}
        onClose={closeTokenDialog}
        onConfirm={token => handleTokenSelect(token, currentTokenSetter, closeTokenDialog)}
        wallets={wallets}
        otherToken={selectedCell === 'toToken' ? selectedRow?.fromToken : selectedRow?.toToken}
        windowId={windowId + '_token_chooser'}
        inputRef={inputRef}
      />;
    }
    return null;
  }, [isTokenDialogOpen, wallets, selectedRow, selectedCell, currentTokenSetter]);

  // Memoize startEditing
  const startEditing = useCallback((row, field, force = false) => {
    if (!row?.swapid || !field) return;

    // Get latest row data first
    const currentRow = rows.find(r => r.swapid === row.swapid);
    if (!currentRow) return;

    const mapping = COLUMN_MAPPING[field];

    if (mapping.editor === 'tokenSelect') {
      setIsTokenDialogOpen(true);
      setSelectedRow(currentRow);
      setSelectedCell(field);
      return;
    }

    const value = mapping.format
      ? mapping.format(currentRow[field], currentRow)
      : currentRow[field];

    setEditValue(value || '');
    setSelectedRow(currentRow);
    setSelectedCell(field);

    if (force) {
      setIsEditing(true);
      setTimeout(() => editInputRef.current?.focus(), 0);
    }
  }, [rows, setEditValue, setSelectedRow, setSelectedCell, setIsEditing, setIsTokenDialogOpen]);

const commitEdit = () => {
  if (!isEditing || !selectedRow || !selectedCell) return;
  
  // Special handling for routes (no column mapping exists)
  if (selectedCell === 'routes') {
    handleCellUpdate(selectedRow, selectedCell, editValue);
    editBlur();
    return;
  }
  
  const mapping = COLUMN_MAPPING[selectedCell];
  if (!mapping) {
    console.warn(`No mapping found for field: ${selectedCell}`);
    return;
  }
  
  if (mapping.editor === 'number') {
    const num = parseFloat(editValue);
    if (isNaN(num)) {
      console.warn('Invalid number input');
      return;
    }
    if (mapping.range) {
      const [min, max] = mapping.range;
      if (num < min || num > max) {
        console.warn(`Number out of range [${min}, ${max}]`);
        return;
      }
    }
  }
  handleCellUpdate(selectedRow, selectedCell, editValue);
  editBlur();
};

  const cancelEdit = () => {
    setIsEditing(false);
    editBlur();
  };

  const editBlur = () => {
    if (isEditing) {
      setIsEditing(false);

      editInputRef.current.blur();
      try{
        //focus back on the cell
        document.querySelector('.cell_' + selectedCell + '_' + selectedRow.swapid).focus();
      } catch (error) {
        console.error('Error focusing cell:', error);
      }
    }
  };

  const handleEditKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault(); // Add this
      commitEdit();
    } else if (e.key === 'Escape') {
      e.preventDefault(); // Add this
      cancelEdit();
    }
  };

  const handleEditChange = (e) => {
    const newValue = e.target.value;
    setEditValue(newValue);
  
    // Only handle routes selection immediately
    if (selectedCell === 'routes') {
      handleCellUpdate(selectedRow, selectedCell, newValue);
      // Ensure the select element reflects the current value
      if (editInputRef.current) {
        editInputRef.current.value = newValue;
      }
      return;
    }
  
    // For other fields, just update the edit value
    // Validation will happen on commitEdit
    const mapping = COLUMN_MAPPING[selectedCell];
    if (!mapping) {
      console.warn(`No mapping found for field: ${selectedCell}`);
      return;
    }
  };

  useEffect(() => {
    if (selectedRow && selectedCell && selectedCell === 'routes') {
      setEditValue(selectedRow.selectedRoute || 'optimal');

    } else {
      setEditValue(getSelectedValue());
    }
  }, [selectedRow, selectedCell]);

  // Add effect to update destination address when toToken changes
  useEffect(() => {
    const updateDestination = (row) => {
      if (!row?.toToken || !wallets || row.isEmpty) return;

      const wallet = chooseWalletForToken(row.toToken, wallets);
      if (wallet) {
        setRows(current =>
          current.map(r =>
            r.swapid === row.swapid
              ? {
                ...r,
                destinationAddress: wallet.address,
                iniData: updateIniField(r.iniData, 'destination', wallet.address)
              }
              : r
          )
        );
      }
    };


    // Update destination for selected row when toToken changes
    if (selectedRow) {
      updateDestination(selectedRow);
    }
  }, [selectedRow?.toToken, wallets]);

  // Add updateBalances function near the top with other function declarations
  // Add this rate limiting helper near other utility functions
  const rateLimiter = {
    lastCall: 0,
    minDelay: 2000, // 2 seconds between calls
    async waitForNext() {
      const now = Date.now();
      const timeSinceLastCall = now - this.lastCall;
      if (timeSinceLastCall < this.minDelay) {
        await new Promise(resolve => setTimeout(resolve, this.minDelay - timeSinceLastCall));
      }
      this.lastCall = Date.now();
    }
  };

  // ...rest of existing code...

  function safeStringify(obj) {
    return JSON.stringify(obj, (key, value) =>
      typeof value === 'bigint' ? value.toString() : value
    );
  }

  // Replace the balance update interval effect with this optimized version
  useEffect(() => {
    if (!selectedRow?.swapid || selectedRow.isEmpty) return;

    const refreshWalletBalances = async () => {
      const now = Date.now();
      const activeChains = getActiveChains(rows);

      // Collect chains that need updating
      const chainsToUpdate = activeChains.filter(chain => {
        const lastUpdate = lastWalletUpdate[chain] || 0;
        return now - lastUpdate > 60000; // 1 minute
      });

      if (chainsToUpdate.length === 0) return;

      // Get prices for all tokens at once
      const allTokens = chainsToUpdate.flatMap(chain => {
        const chainTokens = [];
        // Add native token
        const gasAsset = getGasAsset({ chain });
        if (gasAsset) {
          chainTokens.push(`${gasAsset.chain}.${gasAsset.symbol}`);
        }
        // Add tokens from rows
        rows.forEach(row => {
          if (row.isEmpty) return;
          if (row.fromToken?.chain === chain) chainTokens.push(row.fromToken.identifier);
          if (row.toToken?.chain === chain) chainTokens.push(row.toToken.identifier);
        });
        return chainTokens;
      });

      // Fetch all prices in one call
      await rateLimiter.waitForNext();
      const tokenPrices = await fetchMultipleTokenPrices([...new Set(allTokens)]);
      if (!tokenPrices) {
        console.log('failed to get prices');
        return;
      }
      
      try{

        const priceMap = tokenPrices.reduce((acc, item) => {
          acc[item.identifier.toLowerCase()] = item.price_usd;
          return acc;
        }, {});

        // Update balances for each chain using refreshBalance
        for (const chain of chainsToUpdate) {
          await rateLimiter.waitForNext();
          await refreshBalance(chain);

          setWalletBalances(prev => ({
            ...prev,
            [chain]: {
              balance: wallets.find(w => w.chain === chain)?.balance || [],
              prices: priceMap,
              timestamp: now
            }
          }));

          setLastWalletUpdate(prev => ({
            ...prev,
            [chain]: now
          }));
        }
      } catch (error) {
        console.error('Failed to update wallet balances:', error);
      }

    };

    refreshWalletBalances();

    const updateInterval = setInterval(refreshWalletBalances, 60000);
    return () => clearInterval(updateInterval);
  }, [selectedRow?.swapid, rows, refreshBalance, wallets]);

  // Replace the balance update interval effect with this optimized version
  useEffect(() => {
    if (!selectedRow?.swapid || selectedRow.isEmpty) return;

    const rowId = selectedRow.swapid;
    const lastUpdate = lastBalanceUpdate[rowId] || 0;
    const now = Date.now();

    // Only update if more than 30 seconds have passed
    if (now - lastUpdate < 30000) {
      return;
    }

    // Add to queue if not already there
    if (!balanceUpdateQueue.has(rowId)) {
      setBalanceUpdateQueue(prev => new Set(prev).add(rowId));
    }

    // Process queue with delay between requests
    const processQueue = async () => {
      if (balanceUpdateQueue.size === 0) return;

      const [firstId] = balanceUpdateQueue;
      if (firstId === rowId) {
        try {
          const updatedRow = await updateBalances(selectedRow, wallets, skClient);
          if (updatedRow && safeStringify(updatedRow) !== safeStringify(selectedRow)) {
            setSelectedRow(prev => ({
              ...prev,
              fromToken: {
                ...prev.fromToken,
                balance: updatedRow.fromToken?.balance
              },
              toToken: {
                ...prev.toToken,
                balance: updatedRow.toToken?.balance
              },
              gasBalance: updatedRow.gasBalance
            }));
          }
          // Update last balance time
          setLastBalanceUpdate(prev => ({ ...prev, [rowId]: now }));
        } catch (error) {
          console.error('Balance update failed:', error);
        }

        // Remove from queue after processing
        setBalanceUpdateQueue(prev => {
          const newQueue = new Set(prev);
          newQueue.delete(rowId);
          return newQueue;
        });
      }
    };

    processQueue();

    // Clear this row from queue on unmount
    return () => {
      setBalanceUpdateQueue(prev => {
        const newQueue = new Set(prev);
        newQueue.delete(rowId);
        return newQueue;
      });
    };
  }, [selectedRow?.swapid, wallets]);

  // Update useEffect to keep ref in sync
  useEffect(() => {
    selectedRowRef.current = selectedRow;
  }, [selectedRow]);

  // 1. Update the rows ref sync effect to prevent loops
  useEffect(() => {
    // Only update rowsRef if actual content changed
    if (rowsRef.current !== rows) {
      rowsRef.current = rows;
    }

    //check for unique swapids
    const swapids = new Set();
    let needsUpdate = false;
    const newRows = rows.map((row) => {
      if (swapids.has(row.swapid)) {
        needsUpdate = true;
        return { ...row, swapid: Date.now() + Math.random() };
      }
      swapids.add(row.swapid);
      return row;
    });

    if (needsUpdate) {
      setRows(newRows);
    }

  }, [rows]);

  // 2. Update the menu action binding to use stable reference
  useEffect(() => {
    const menuHandler = handleMenuActionRef.current;
    if (onMenuAction && menu) {
      onMenuAction(menu, windowA, (...args) => menuHandler(...args));
    }
  }, [onMenuAction, windowA, menu]); // Remove handleMenuActionRef from deps

  // 3. Fix the selected row ref sync 
  useEffect(() => {
    // Only update if content actually changed
    if (selectedRowRef.current?.swapid !== selectedRow?.swapid) {
      selectedRowRef.current = selectedRow;
    }
  }, [selectedRow?.swapid]);

  // 4. Update the duplicate swapid check to prevent unnecessary updates
  useEffect(() => {
    //check for duplicate swapids and renumber if so
    const swapids = new Set();
    let needsUpdate = false;

    const newRows = rows.map((row) => {
      if (swapids.has(row.swapid)) {
        needsUpdate = true;
        return { ...row, swapid: Date.now() + Math.random() };
      }
      swapids.add(row.swapid);
      return row;
    });

    if (needsUpdate) {
      setRows(newRows);
    }
  }, [rows]); // Consider using rows.map(r => r.swapid).join(',') as dependency

  const columns = useExoraColumns({
    compactView,
    COLUMN_MAPPING,
    handleCellSelect,
    startEditing,
    selectedRow,
    selectedCell,
    getLetterForIndex,
    setSelectedRow,
    setSelectedCell,
    setCurrentTokenSetter,
    updateCell,
    setIsTokenDialogOpen,
    wallets, // Add wallets to props
    formatTokenBalance, // Add helper function
  });

  handleMenuActionRef.current = handleMenuAction;

  // Update menu action effect to use stable references
  useEffect(() => {
    if (onMenuAction && menu && handleMenuActionRef) {
      onMenuAction(menu, windowA, handleMenuActionRef.current);
    }
  }, [onMenuAction, menu, handleMenuActionRef]);

  const handleReset = useCallback(() => {
    // If a row is selected, only reset that row
    if (selectedRow) {
      setRows(current =>
        current.map(r =>
          r.swapid === selectedRow.swapid
            ? {
                ...r,
                status: r.route ? "Reset - Quote ready" : "Reset - Quote needed",
                swapInProgress: false,
                reportData: null,
                txIds: null,
                explorerUrls: null,
                txStatus: null,
                progress: null
              }
            : r
        )
      );
    } else {
      // If no row is selected, ask for confirmation to reset all rows
      if (window.confirm("Reset all transactions? This will clear transaction details for all rows.")) {
        setRows(current =>
          current.map(r => ({
            ...r,
            status: r.route ? "Reset - Quote ready" : "Reset - Quote needed",
            swapInProgress: false,
            reportData: null,
            txIds: null,
            explorerUrls: null,
            txStatus: null,
            progress: null
          }))
        );
      }
    }
  }, [selectedRow, setRows]);

  // Define handleRefreshBalances function
  const handleRefreshBalances = useCallback(async () => {
    if (!selectedRow) return;
    
    try {
      // Update UI to show refresh is happening
      setRows(current => 
        current.map(r => 
          r.swapid === selectedRow.swapid 
            ? { ...r, status: "Refreshing balances..." } 
            : r
        )
      );
      
      // Refresh balance for the row's chains
      if (selectedRow.fromToken?.chain) {
        await refreshBalance(selectedRow.fromToken.chain);
      }
      
      if (selectedRow.toToken?.chain && selectedRow.toToken.chain !== selectedRow.fromToken?.chain) {
        await refreshBalance(selectedRow.toToken.chain);
      }
      
      // Get updated row with new balances
      const updatedRow = await updateBalances(selectedRow, walletBalances, refreshBalance);
      
      if (updatedRow) {
        // Update row in state with new balances
        setRows(current => 
          current.map(r => 
            r.swapid === selectedRow.swapid 
              ? {
                  ...r,
                  fromToken: {
                    ...r.fromToken,
                    balance: updatedRow.fromToken?.balance,
                    usdValue: updatedRow.fromToken?.usdValue
                  },
                  toToken: {
                    ...r.toToken,
                    balance: updatedRow.toToken?.balance,
                    usdValue: updatedRow.toToken?.usdValue
                  },
                  gasBalance: updatedRow.gasBalance,
                  status: r.status === "Refreshing balances..." ? "Balances refreshed" : r.status
                }
              : r
          )
        );
      }
    } catch (error) {
      console.error("Error refreshing balances:", error);
      // Update UI to show refresh failed
      setRows(current => 
        current.map(r => 
          r.swapid === selectedRow.swapid 
            ? { ...r, status: "Balance refresh failed" } 
            : r
        )
      );
    }
  }, [selectedRow, refreshBalance, updateBalances, walletBalances]);

  // Add a clearSelection function
  const clearSelection = useCallback(() => {
    setSelectedRow(null);
    setSelectedCell(null);
    
    // Clear selected state from all rows
    setRows(current => 
      current.map(r => r.selected ? { ...r, selected: false } : r)
    );
  }, [setSelectedRow, setSelectedCell, setRows]);

  // Add a useEffect to track transaction statuses
  useEffect(() => {
    // Update the ref whenever txnTimers changes
    txnTimersRef.current = txnTimers;
  }, [txnTimers]);

  // Add checkRowTxnStatus function to poll transaction status
  const checkRowTxnStatus = useCallback(async (rowId, txnHash, count = 0) => {
    const currentRows = rowsRef.current || rows;
    const row = currentRows.find(r => r.swapid === rowId);
    
    if (!row || !row.swapInProgress || !txnHash || count > 100) {
      return;
    }

    // If txnStatus indicates it's done, stop checking
    if (row.txStatus?.done === true) {
      setRows(current => 
        current.map(r => r.swapid === rowId 
          ? { 
              ...r, 
              swapInProgress: false,
              progress: 100,
              status: "Swap completed"
            } 
          : r
        )
      );
      return;
    }

    try {
      // Get transaction status from API
      const status = await getTxnDetails({ hash: txnHash }).catch(error => {
        console.error("Error getting transaction details:", error);
        return null;
      });

      if (!status) {
        // If we can't get status, continue checking but with longer delay
        const newTimer = setTimeout(() => {
          checkRowTxnStatus(rowId, txnHash, count + 1);
        }, 30000);
        
        setTxnTimers(current => ({
          ...current,
          [rowId]: newTimer
        }));
        return;
      }

      // Update status in state
      status.lastCheckTime = Date.now();
      setRows(current => 
        current.map(r => r.swapid === rowId 
          ? { ...r, txStatus: status } 
          : r
        )
      );

      // Update progress based on status
      if (status.status === "running") {
        setRows(current => 
          current.map(r => r.swapid === rowId 
            ? { ...r, progress: Math.min(r.progress + 1, 95) } 
            : r
          )
        );

        // Calculate delay for next check
        const delay = 10000; // Default 10s
        
        // Clear existing timer
        if (txnTimersRef.current[rowId]) {
          clearTimeout(txnTimersRef.current[rowId]);
        }

        // Set new timer
        const newTimer = setTimeout(() => {
          checkRowTxnStatus(rowId, txnHash, count + 1);
        }, delay);
        
        setTxnTimers(current => ({
          ...current,
          [rowId]: newTimer
        }));
      } else if (status.status === "completed") {
        // Transaction completed
        setRows(current => 
          current.map(r => r.swapid === rowId 
            ? { 
                ...r, 
                progress: 100,
                status: "Swap completed",
                swapInProgress: false
              } 
            : r
          )
        );
      }
    } catch (error) {
      console.error("Error in transaction check:", error);
      
      // Set a timer to try again
      const newTimer = setTimeout(() => {
        checkRowTxnStatus(rowId, txnHash, count + 1);
      }, 30000);
      
      setTxnTimers(current => ({
        ...current,
        [rowId]: newTimer
      }));
    }
  }, [rows, setRows, setTxnTimers]);

  // Add function to start tracking a transaction
  const startTrackingTransaction = useCallback((row, txHash) => {
    if (!row || !txHash) return;
    
    // Start tracking the transaction
    checkRowTxnStatus(row.swapid, txHash);
    
    // Set initial progress and status
    setRows(current => 
      current.map(r => r.swapid === row.swapid 
        ? { 
            ...r, 
            progress: 10,
            txIds: [...(r.txIds || []), txHash],
            txStatus: { done: false, lastCheckTime: Date.now() }
          } 
        : r
      )
    );
  }, [checkRowTxnStatus, setRows]);

  // Update useExoraActions hook call to include these new functions
  const {
    handleQuote,
    handleExecute,
    handleExecuteAll,
  } = useExoraActions({
    rows,
    setRows,
    skClient,
    wallets,
    tokens,
    chainflipBroker,
    onOpenWindow,
    startTrackingTransaction, // Add new tracking function
    providers
  });

  // Add a cleanup effect to clear all timers when unmounting
  useEffect(() => {
    return () => {
      // Clear all transaction timers
      Object.values(txnTimersRef.current).forEach(timer => {
        clearTimeout(timer);
      });
    };
  }, []);

  // Add effect to start tracking transactions when new txIds are added
  useEffect(() => {
    // For each row with txIds but no active timer, start tracking
    rows.forEach(row => {
      if (row.txIds?.length > 0 && row.swapInProgress && !txnTimersRef.current[row.swapid]) {
        // Use the most recent transaction ID
        const latestTxId = row.txIds[row.txIds.length - 1];
        startTrackingTransaction(row, latestTxId);
      }
    });
  }, [rows, startTrackingTransaction]);

  // When a row is updated with new explorer URLs but no txIds, extract hash from URL
  useEffect(() => {
    rows.forEach(row => {
      if (row.explorerUrls?.length > 0 && (!row.txIds || row.txIds.length === 0)) {
        // Try to extract txn hash from explorer URL
        const url = row.explorerUrls[row.explorerUrls.length - 1];
        const txHash = url.split('/').pop();
        
        if (txHash && !row.txIds?.includes(txHash)) {
          setRows(current => 
            current.map(r => r.swapid === row.swapid 
              ? { ...r, txIds: [...(r.txIds || []), txHash] } 
              : r
          ));
          
          if (row.swapInProgress && !txnTimersRef.current[row.swapid]) {
            startTrackingTransaction(row, txHash);
          }
        }
      }
    });
  }, [rows, setRows, startTrackingTransaction]);

  // console.log('rows', rows);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }} className="exora">
      <div style={{ display: 'flex', height: '30px', backgroundColor: '#ccc', padding: '0', paddingTop: '2px', paddingBottom: '2px', flexShrink: 0 }}>
        <ActionButton 
          visible={true} 
          onClick={() => handleExecuteAll(false)} 
          title="Execute all swaps in parallel, waiting for balance when needed. Rows with existing transactions will be skipped." 
          icon="▶️"
        >Go All</ActionButton>
        <ActionButton 
          visible={true} 
          onClick={() => handleExecuteAll(true)} 
          title="Execute swaps in order, waiting for balance when needed. Rows with existing transactions will be skipped." 
          icon="▶️"
        >Go in turn</ActionButton>
        <ActionButton 
          visible={true} 
          onClick={handleOptimizeForGas} 
          title="Optimize swap chains to ensure enough gas for all transactions" 
          icon="⛽"
        >Gas Smart</ActionButton>
        <ActionButton visible={true} onClick={handleReset} title="Clear transaction details to enable re-execution" icon="🔄">Reset</ActionButton>
        <ActionButton visible={true} onClick={handleAddRow} icon="➕">New</ActionButton>
        <ActionButton visible={!!selectedRow} onClick={handleRefreshBalances} title="Refresh balances for the selected row" icon="💰">Refresh</ActionButton>
        <ActionButton visible={!!selectedRow} onClick={clearSelection} title="Clear current row selection" icon="❌">Clear Selection</ActionButton>
      </div>

      <EditBar style={{ flexShrink: 0 }}>
        <ActionButton
          icon="▶️"
          visible={!!selectedRow}
          onClick={() => handleExecute(selectedRowRef.current)}
          disabled={selectedRow?.status === 'Running' || hasRowTxData(selectedRow)}
          title={hasRowTxData(selectedRow) ? "Row already has transaction data. Reset first to execute again." : "Execute this swap"}
        >
          {selectedRow?.status === 'Running' ? 'Running...' : 'Go One'}
        </ActionButton>
        <ActionButton visible={!!selectedRow} onClick={() => handleQuote(selectedRowRef.current)} icon="💬">
          Quote
        </ActionButton>
        <ActionButton visible={!!selectedRow} onClick={() => handleEdit(selectedRow)} icon="✏️">
          Edit
        </ActionButton>
        {selectedRow?.reportData && (
          <ActionButton
            visible={true}
            onClick={() => {
              onOpenWindow('notepad.exe', {
                content: JSON.stringify(selectedRow.reportData, null, 2),
                filename: `swap_report_${selectedRow.swapid}.json`
              });
            }}
            icon="📋"
          >
            Log
          </ActionButton>
        )}
        {selectedRow && (
          <div style={{ 
            display: 'inline-block', 
            marginLeft: '10px', 
            backgroundColor: '#f0f0f0', 
            padding: '2px 8px', 
            borderRadius: '4px',
            fontSize: '12px',
            color: '#444'
          }}>
            Selected: {selectedRow.fromToken?.symbol || '?'} → {selectedRow.toToken?.symbol || '?'}
          </div>
        )}
        {selectedCell === 'routes' ? (
          <EditSelect
            value={editValue}
            onChange={handleEditChange}
            onKeyDown={handleEditKeyDown}
            onFocus={startEditing}
            onBlur={editBlur}
            ref={editInputRef}
          >
            <option value="optimal">Optimal Route</option>
            {selectedRow?.routes?.map((rt, idx) => (
              <option
                key={idx}
                value={rt.providers.join(', ')}
              >
                {rt.providers.join(', ')} ({rt.expectedBuyAmount} {selectedRow.toToken?.symbol})
              </option>
            ))}
          </EditSelect>
        ) : selectedCell === 'feeOption' ? (
          <EditSelect
            value={editValue}
            onChange={handleEditChange}
            onKeyDown={handleEditKeyDown}
            onFocus={startEditing}
            onBlur={editBlur}
            ref={editInputRef}
          >
            {COLUMN_MAPPING.feeOption.options.map(option => (
              <option key={option} value={option}>{option}</option>
            ))}
          </EditSelect>
        ) : (
          <EditInputBase
            value={editValue}
            onChange={handleEditChange}
            onKeyDown={handleEditKeyDown}
            onBlur={commitEdit}
            onClick={() => {
              if (selectedCell && selectedRow && !isEditing) {
                const currentRow = rows.find(r => r.swapid === selectedRow.swapid);
                if (currentRow) {
                  startEditing(currentRow, selectedCell, true);
                }
              }
            }}
            placeholder="Select a cell to edit"
            readOnly={!selectedCell || COLUMN_MAPPING[selectedCell]?.editor === 'readonly'}
            ref={editInputRef}
          />
        )}
      </EditBar>
      <SpreadsheetContainer>

        <InnerScrollContainer>

          <DataTable
            columns={columns}
            data={getAllRows}
            dense
            customStyles={{ ...customStyles, tableWrapper: { overflow: 'visible', width: 'fit-content' } }}
            responsive
            onRowClicked={handleRowClick}
            pagination={false}
            selectableRowSelected={row => row.selected}
            selectableRowsHighlight={true}
            selectableRowsSingle={true}
          />
        </InnerScrollContainer>
      </SpreadsheetContainer>
      {tokenChooserDialog}
    </div>
  );
};

export default Exora;
