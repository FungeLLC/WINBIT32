import React, { useEffect, useMemo, useCallback, useRef, useState } from 'react';
import { useIsolatedState } from '../../win/includes/customHooks';
import DataTable from 'react-data-table-component';
import { useWindowSKClient } from '../../contexts/SKClientProviderManager';
import { parseIniData } from './helpers/handlers';
import './styles/Exora.css';
import { getQuotes } from './helpers/quotes';
import { handleSwap } from './helpers/handlers';
import { COLUMN_MAPPING, updateIniField, validateField } from './helpers/swapini';
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



// Add this helper function near the top with other utility functions
const hasData = (row) => {
  if (!row || row.isEmpty) return false;
  
  return Object.entries(COLUMN_MAPPING)
    .some(([field, mapping]) => {
      if (field === 'swapid') return false; // Ignore swapid
      
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
    const gasAsset = row.fromToken?.chain ? getGasAsset({chain: row.fromToken.chain}) : null;
    if (gasAsset?.chain) chains.add(gasAsset.chain);
  });
  return Array.from(chains);
};

const initialRowState = {
  swapid: null,
  iniData: '',
  route: null,
  fromToken: '',
  toToken: '',
  amountIn: '',
  expectedOut: '',
  status: '',
  isEmpty: false,
  affiliate: 'be', 
  mayaAffiliate: 'be',
  thorAffiliate: 'be',
  license: true,
  locked: false,             // <-- new property for locking row
  swapInProgress: false,     // <-- new property for progress indication
  txIds: null,                // <-- new property to store transaction ids after swap completes
  reportData: null,           // <-- new property for report data
};

const EMPTY_ROW_COUNT =25;


const Exora = ({ providerKey, windowId, programData, onOpenWindow, onMenuAction, windowA,  windowName, }) => {
  const { skClient, tokens, wallets, chainflipBroker, refreshBalance } = useWindowSKClient(providerKey);
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

  // Add this near other state declarations
  const selectedRowRef = useRef(null);

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
    switch(direction) {
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

      switch(e.key) {
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
      (token) => { displayData.fromToken = token },
      (token) => { displayData.toToken = token },
      (amount) => { displayData.amountIn = amount },
      (address) => { displayData.destinationAddress = address },
      (option) => { displayData.feeOption = option },
      (slip) => { displayData.slippage = slip },
      (route) => { displayData.selectedRoute = route },
      () => {}, // setRoutes
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

const handleQuote = useCallback(async (row) => {
  // Get latest row data from rows state
  const currentRow = rows.find(r => r.swapid === row.swapid) || row;
  
  if (!currentRow || !currentRow.fromToken || !currentRow.toToken || !currentRow.amountIn) {
    setRows(current => 
      current.map(r => 
        r.swapid === currentRow?.swapid 
          ? { ...r, status: 'Please select tokens and enter amount' }
          : r
      )
    );
    return;
  }
  
  const wallet = chooseWalletForToken(currentRow.fromToken, wallets); // Changed from row to currentRow
  
  if (!wallet) {
    setRows(current => 
      current.map(r => 
        r.swapid === currentRow.swapid // Changed from row to currentRow
          ? { ...r, status: 'No wallet available for selected token' }
          : r
      )
    );
    return;
  }
  
  setRows(current => 
    current.map(r => 
      r.swapid === currentRow.swapid // Changed from row to currentRow
        ? { ...r, status: 'Quoting...' }
        : r
    )
  );

  // Rest of the quote logic using currentRow instead of row
  const destination = currentRow.destinationAddress?.trim() || wallet.address;

  try {
    const routes = await getQuotes(
      currentRow.fromToken, // Changed from row to currentRow
      currentRow.toToken,
      parseFloat(currentRow.amountIn),
      destination,
      currentRow.slippage || 1,
      (text) => setRows(current => 
        current.map(r => 
          r.swapid === currentRow.swapid 
        ? { ...r, status: text }
        : r
        )
      ),
      (quoteStatus) => setRows(current =>
        current.map(r =>
          r.swapid === currentRow.swapid
            ? { ...r, quoteStatus }
            : r
        )
      ),
      (routes) => {
        if (routes && routes.length > 0) {
          const bestRoute = routes.find(r => r.optimal) || routes[0];
          setRows(current => 
            current.map(r => 
              r.swapid === currentRow.swapid 
                ? { 
                    ...r,
                    routes,
                    selectedRoute: bestRoute.providers.join(', '),
                    route: bestRoute,
                    expectedOut: bestRoute.expectedBuyAmount,
                    status: 'Quote Ready'
                  }
                : r
            )
          );
        }
      },
      () => wallet,
      tokens,
      (address) => setRows(current =>
        current.map(r =>
          r.swapid === currentRow.swapid
            ? { ...r, destinationAddress: address }
            : r
        )
      ),
      (route) => setRows(current =>
        current.map(r =>
          r.swapid === currentRow.swapid
            ? { ...r, selectedRoute: route }
            : r
        )
      ),
      wallets,
      currentRow.selectedRoute || 'optimal',
      currentRow.license !== false,
      null, // setReportData - we don't need this for grid view
      currentRow.iniData || '',
      currentRow.thorAffiliate || 'be',
      currentRow.mayaAffiliate || 'be',
      (affiliate) => setRows(current =>
        current.map(r =>
          r.swapid === currentRow.swapid
            ? { ...r, thorAffiliate: affiliate }
            : r
        )
      ),
      (affiliate) => setRows(current =>
        current.map(r =>
          r.swapid === currentRow.swapid
            ? { ...r, mayaAffiliate: affiliate }
            : r
        )
      ),
      (quoteData) => setRows(current => 
        current.map(r => r.swapid === currentRow.swapid ? {
          ...r,
          reportData: {
            ...r.reportData,
            quotes: quoteData,
            quoteTime: new Date().toISOString()
          }
        } : r)
      )
    );

    if (!routes || routes.length === 0) {
      setRows(current => 
        current.map(r => 
          r.swapid === currentRow.swapid 
            ? { ...r, status: 'No routes available' }
            : r
        )
      );
    }
    


  } catch (error) {
    console.error('Error quoting:', error);
    setRows(current => 
      current.map(r => 
        r.swapid === currentRow.swapid 
          ? { ...r, status: `Error: ${error.message}`,
              reportData: {
                ...r.reportData,
                quoteError: error.message,
                errorTime: new Date().toISOString()
              }
            }
          : r
      )
    );
  }
}, [rows, wallets, tokens]);

  const handleEdit = (row) => {

    //add a swapid if empty
    if (!row.swapid){
      row.swapid = Date.now();
    }

    onOpenWindow('exchange.exe', {
      initialIniData: row.iniData,
      editMode: true,
      onSave: (newIniData, otherData) => {
        setRows(current => {
          // Find row positions
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

          // Check next row
          const nextRow = updatedRows[currentIndex + 1];
          if (nextRow) {
            console.log('nextRow', nextRow);
            if (nextRow.isEmpty) {
              // Insert new row with output values
              updatedRows[currentIndex + 1] = {
                ...initialRowState,
                swapid: Date.now(),
                iniData: `token_from=${otherData.swapTo?.identifier}\namount=${otherData.expectedOut}`,
                fromToken: otherData.swapTo,
                amountIn: otherData.expectedOut,
                status: 'New'
              };
            } else if (nextRow.fromToken === otherData.swapTo) {
              // Update existing row amount
              updatedRows[currentIndex + 1] = {
                ...nextRow,
                iniData: nextRow.iniData.replace(/amount=.*/, `amount=${otherData.expectedOut}`),
                amountIn: otherData.expectedOut
              };
            }
          }else{
              updatedRows.push(
                {
                  ...initialRowState,
                  swapid: Date.now(),
                  iniData: `token_from=${otherData.swapTo?.identifier}\namount=${otherData.expectedOut}`,
                  fromToken: otherData.swapTo,
                  amountIn: otherData.expectedOut,
                  status: 'New'
                }
              );
          }

          return updatedRows;
        });
        return true;
      }
    });
  };

// Update handleExecute to use useCallback
const handleExecute = useCallback(async (row) => {
  // Lock the row and show progress
  const updatedRow = { ...row, locked: true, swapInProgress: true };
  setRows(prevRows => prevRows.map(r => r.swapid === row.swapid ? updatedRow : r));

  try {
    // Call handleSwap with all required parameters
    const swapResult = await handleSwap(
      row.fromToken,
      row.toToken,
      row.amountIn,
      row.destinationAddress,
      row.routes || [],
      row.selectedRoute,
      row.slippage || 1,
      skClient,
      wallets,
      // Status update functions wrapped to update specific row
      (text) => setRows(current => 
        current.map(r => r.swapid === row.swapid ? { ...r, status: text } : r)
      ),
      (inProgress) => setRows(current => 
        current.map(r => r.swapid === row.swapid ? { ...r, swapInProgress: inProgress } : r)
      ),
      (show) => setRows(current => 
        current.map(r => r.swapid === row.swapid ? { ...r, showProgress: show } : r)
      ),
      (prog) => setRows(current => 
        current.map(r => r.swapid === row.swapid ? { ...r, progress: prog } : r)
      ),
      (hash) => setRows(current => 
        current.map(r => r.swapid === row.swapid ? { ...r, txnHash: hash } : r)
      ),
      (url) => setRows(current => 
        current.map(r => r.swapid === row.swapid ? { ...r, explorerUrl: url } : r)
      ),
      (status) => setRows(current => 
        current.map(r => r.swapid === row.swapid ? { ...r, txnStatus: status } : r)
      ),
      (timer) => setRows(current => 
        current.map(r => r.swapid === row.swapid ? { ...r, txnTimer: timer } : r)
      ),
      tokens,
      row.swapInProgress,
      row.feeOption || 'Average',
      { current: row.txnStatus },
      chainflipBroker,
      row.streamingSwap,
      row.streamingInterval,
      row.streamingNumSwaps,
      null, // setReportData not needed
      row.iniData,
      row.license !== false,
      true,
      (route) => setRows(current =>
        current.map(r =>
          r.swapid === row.swapid
            ? { ...r, selectedRoute: route }
            : r
        )
      ),  
      (reportData) => setRows(current => 
        current.map(r => r.swapid === row.swapid ? { 
          ...r, 
          reportData: {
            ...r.reportData,
            ...reportData,
            executionTime: new Date().toISOString()
          }
        } : r)
      )
    );

    // On success update the row with transaction id(s) and mark swap as complete
    if (swapResult) {
      setRows(prevRows => prevRows.map(r => r.swapid === row.swapid ? {
        ...r,
        swapInProgress: false,
        txIds: swapResult.txIds || [swapResult.txId]
      } : r));
    }
  } catch (err) {
    // In case of error, reset progress flag
    setRows(prevRows => prevRows.map(r => r.swapid === row.swapid ? {
      ...r, 
      swapInProgress: false,
      status: `Error: ${err.message}`,
      reportData: {
        ...r.reportData,
        error: err.message,
        errorTime: new Date().toISOString()
      }
    } : r));
    console.error("Swap execution error:", err);
  }
}, [skClient, wallets, setRows]); // Add any other dependencies used inside handleExecute

  // Handle click on any row
  const handleRowClick = (row) => {
    console.log('handleRowClick', row);
    if (!row.isEmpty){
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
    if(selectedRow && selectedCell){
      //remove border from all cells
      document.querySelectorAll('.cell_inner').forEach((cell) => {
        cell.style.border = 'none';
      });
      console.log('selectedCell', selectedCell);
      //add border to selected cell
      document.querySelectorAll('.cell_' + selectedCell + '_' + selectedRow.swapid).forEach((cell) => {
        cell.style.border = '1px solid #000';
      });
    }
  }, [selectedRow, selectedCell]);


// Replace getVisibleColumns cell renderer for tokenSelect fields
const getVisibleColumns = () => {
  const numberCol = {
    name: <><RowNumber style={{ zIndex: 1, marginTop: 0 }}>#</RowNumber><RowNumber style={{ zIndex: 2, marginTop: '1px' }}>1</RowNumber></>,
    width: '30px',
    button: true,
    cell: (row, index) => (
      <RowNumber
        onClick={() => handleCellSelect(row)}
        style={{
          cursor: row.isEmpty ? 'default' : 'pointer',
          textAlign: 'center',
          userSelect: 'none',
          background: '#c3cbcb', 
          border: selectedRow?.swapid === row.swapid ? '2px inset #e6f3ff' : '2px outset #989e9e'
        }}
      >
        {index + 2}
      </RowNumber>
    )
  };

  const dataColumns = Object.entries(COLUMN_MAPPING)
    .filter(([_, mapping]) => !compactView || mapping.compact)
    .map(([field, mapping], idx) => ({
      name: (
        <HeaderCell>
          <LetterCell>{getLetterForIndex(idx)}</LetterCell>
          <div>{mapping.title}</div>
        </HeaderCell>
      ),
      selector: row => row[field],
      cell: row => (
        <div 
          className={"cell_inner editor_" + mapping.editor + ' cell_' + field + '_' + row?.swapid }
          onClick={() => handleCellSelect(row, field)}
          onDoubleClick={() => {
            // Use clicked row and field directly
            handleCellSelect(row, field);
            startEditing(row, field);
          }}
          style={{
            cursor: 'pointer', // Always show pointer since we can select any cell
            padding: '4px',
            border: selectedRow?.swapid === row.swapid && selectedCell === field ? '1px solid #000' : 'none',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}
        >
          {mapping.editor === 'tokenSelect' ? (
            <>
              {row[field] ? (
                <span style={{ display: 'flex', alignItems: 'center' }}>
                  <img 
                    src={row[field].logoURI} 
                    alt={row[field].name} 
                    style={{ width: '20px', height: '20px', marginRight: '5px' }} 
                  />
                  <span>
                    <b>{row[field].ticker}</b>
                    {' '}{row[field].name} on {row[field].chain}
                    {row[field]?.ticker?.includes('/') ? ' (Synthetic)' : ''}
                  </span>
                </span>
              ) : <span></span>}
            </>
          ) : (
            <span>{mapping.format ? mapping.format(row[field], row) : row[field]}</span>
          )}
          {mapping.editor === 'tokenSelect' && !row.isEmpty && (
            <FaEllipsisH 
              style={{opacity: 0.5, marginLeft: '4px', cursor: 'pointer'}}
              onClick={(e) => {
                e.stopPropagation(); // Prevent cell selection
                setSelectedRow(row);
                setSelectedCell(field);
                setCurrentTokenSetter(() => (token) => updateCell(row, field, token));
                setIsTokenDialogOpen(true);
              }}
            />
          )}
        </div>
      )
    }));

  const routeColumn = {
    name: (
      <HeaderCell>
        <LetterCell>{getLetterForIndex(dataColumns.length)}</LetterCell>
        <div>Routes</div>
      </HeaderCell>
    ),
    selector: row => row.routes,
    editor: 'select', // Add editor type
    cell: row => (
      <div
        className={"cell_inner editor_select cell_routes_" + row?.swapid}
        onClick={() => handleCellSelect(row, 'routes')}
        onDoubleClick={() => {
          handleCellSelect(row, 'routes');
          startEditing(row, 'routes');
        }}
        style={{
          cursor: row.isEmpty ? 'default' : 'pointer',
          padding: '4px',
          display: 'flex',
          flexDirection: 'column',
          gap: '2px'
        }}
      >
        {row.status === 'Quoting...' ? (
          <span style={{color: '#666', fontStyle: 'italic'}}>Getting quotes...</span>
        ) : row.selectedRoute ? (
          <>
            <div>{row.selectedRoute}</div>
            {row.route && 
              <div style={{fontSize: '0.8em', color: '#666'}}>
                {row.route.expectedBuyAmount} {row.toToken?.symbol}
              </div>
            }
          </>
        ) : (row.routes && row.routes.length > 0 ? (
          'Select Route'
        ) : '')}
      </div>
    )
  };

  // Return updated columns (add routeColumn at the end)
  return [numberCol, ...dataColumns, routeColumn];
};

const columns = useMemo(() => getVisibleColumns(), [compactView, rows]);

const menu = useMemo(() => [
  {
    label: 'File',
    submenu: [
      { label: 'Open...', action: 'open' },
      { label: 'Save', action: 'save' },
    ],
  },
  {
    label: 'Edit', 
    submenu: [
      { label: 'Copy Cell', action: 'copyCell' },
      { label: 'Copy Row', action: 'copyRow' },
      { label: 'Copy All', action: 'copyAll' },
      { label: 'Paste', action: 'paste' },
      { label: 'Delete Row', action: 'deleteRow' },
    ],
  },
  {
    label: 'Columns',
    submenu: [
      { label: 'Compact', action: 'compact' },
      { label: 'Show All', action: 'showAll' },
    ],
  }
], []);

// Update near other utility functions
const copyToCSV = (rows) => {
  // Get all column headers
  const headers = Object.entries(COLUMN_MAPPING)
    .map(([_, mapping]) => mapping.title)
    .join(',');
  
  // Convert rows to CSV
  const values = rows.filter(r => !r.isEmpty).map(row =>
    Object.entries(COLUMN_MAPPING).map(([field, mapping]) => {
      const value = row[field];
      return mapping?.format ? mapping.format(value, row) : value || '';
    }).join(',')
  ).join('\n');
  
  return `${headers}\n${values}`;
};

const generateIni = (row) => {
  return Object.entries(COLUMN_MAPPING)
    .filter(([_, mapping]) => mapping.iniField)
    .map(([field, mapping]) => {
      const value = row[field];
      const parsedValue = mapping?.format ? mapping.format(value, row) : value;
      return `${mapping.iniField}=${parsedValue || ''}`;
    })
    .join('\n');
};

const parseIni = (text) => {
  const lines = text.trim().split('\n');
  const result = {};
  
  lines.forEach(line => {
    const [key, value] = line.split('=');
    if (!key || !value) return;
    
    // Find corresponding field from iniField
    const field = Object.entries(COLUMN_MAPPING)
      .find(([_, mapping]) => mapping.iniField === key.trim())?.[0];
      
    if (field) {
      const mapping = COLUMN_MAPPING[field];
      result[field] = mapping?.parse ? mapping.parse(value.trim()) : value.trim();
    }
  });
  
  return result;
};

// Update handleMenuClick
const handleMenuClick = useCallback((action) => {
  if (typeof action === 'function') {
    action();
    return;
  }

  switch (action) {
    case 'copyCell':
      if (selectedCell && selectedRow) {
        const value = selectedCell ? 
          COLUMN_MAPPING[selectedCell]?.format?.(selectedRow[selectedCell], selectedRow) || selectedRow[selectedCell] : '';
        navigator.clipboard.writeText(value);
      }
      break;

    case 'copyRow':
      if (selectedRow) {
        // Copy as INI format
        navigator.clipboard.writeText(generateIni(selectedRow));
      }
      break;

    case 'copyAll':
      // Copy all rows as CSV with headers
      navigator.clipboard.writeText(copyToCSV(rows));
      break;

    case 'paste':
      handlePaste();
      break;

    case 'deleteRow':
      if (selectedRow && !selectedRow.isEmpty) {
        setRows(current => current.filter(r => r.swapid !== selectedRow.swapid));
        setSelectedRow(null);
        setSelectedCell(null);
      }
      break;

    case 'compact':
      setCompactView(true);
      break;

    case 'showAll':
      setCompactView(false);
      break;
  }
}, [selectedCell, selectedRow, rows, setCompactView]);

const handlePaste = async () => {
  try {
    const text = await navigator.clipboard.readText();
    if (!text) return;
    
    // Find first empty row
    const firstEmptyRow = rows.find(r => r.isEmpty);
    if (!firstEmptyRow) return;

    // Try parsing as INI first
    if (!text.includes(',')) {
      try {
        const parsed = parseIniData(
          text,
          // Pass stub functions just to collect the parsed data
          (fromToken) => ({ fromToken }),
          (toToken) => ({ toToken }),
          (amount) => ({ amountIn: amount }),
          (address) => ({ destinationAddress: address }),
          (option) => ({ feeOption: option }),
          (slip) => ({ slippage: slip }),
          () => {}, // setRoutes not needed
          [], // routes
          tokens,
          (streaming) => ({ manualStreamingSet: streaming }),
          (interval) => ({ streamingInterval: interval }),
          (numSwaps) => ({ streamingNumSwaps: numSwaps })
        );

        // Combine all returned objects into one
        const parsedData = Object.assign({}, ...Object.values(parsed));

        if (Object.keys(parsedData).length) {
          setRows(current => {
            const index = current.findIndex(r => r.swapid === firstEmptyRow.swapid);
            const newRows = [...current];
            newRows[index] = {
              ...firstEmptyRow,
              ...parsedData,
              iniData: text,
              isEmpty: false
            };
            return newRows;
          });
          return;
        }
      } catch (err) {
        console.error('INI parse error:', err);
      }
    }
    
    // Fall back to CSV parsing
    const [header, ...lines] = text.trim().split('\n');
    if (lines.length) {
      // Map CSV headers to field names 
      const headerFields = header.split(',').map(h => 
        Object.entries(COLUMN_MAPPING).find(([_, m]) => m.title === h.trim())?.[0]
      );
      
      const parsed = lines.map(line => {
        const values = line.split(',');
        return headerFields.reduce((obj, field, i) => {
          if (!field) return obj;
          const mapping = COLUMN_MAPPING[field];
          if (mapping?.parse) {
            obj[field] = mapping.parse(values[i]);
          } else {
            obj[field] = values[i];
          }
          return obj;
        }, {});
      });

      // Update starting from first empty row
      setRows(current => {
        const startIndex = current.findIndex(r => r.isEmpty);
        if (startIndex === -1) return current;
        
        const newRows = [...current];
        parsed.forEach((p, i) => {
          if (startIndex + i < newRows.length) {
            newRows[startIndex + i] = {
              ...newRows[startIndex + i],
              ...p,
              isEmpty: false
            };
          }
        });
        return newRows;
      });
    }
  } catch (err) {
    console.error('Paste error:', err);
  }
};

  useEffect(() => {
    if (onMenuAction) {
      onMenuAction(menu, windowA, handleMenuClick);
    }
  }, [onMenuAction, menu, windowA, handleMenuClick]);


// Update cell handler
const handleCellUpdate = async (row, field, value) => {
  if (field === 'routes') {
    // Handle optimal route selection
    if (value === 'optimal') {
      const optimalRoute = row.routes?.find(r => r.optimal) || row.routes?.[0];
      if (optimalRoute) {
        setRows(current =>
          current.map(r =>
            r.swapid === row.swapid
              ? {
                  ...r,
                  selectedRoute: 'optimal',
                  route: optimalRoute,
                  expectedOut: optimalRoute.expectedBuyAmount,
                  gasFee: COLUMN_MAPPING.gasFee.format(null, { route: optimalRoute, fromToken: r.fromToken })
                }
              : r
          )
        );
      }
      setEditValue('optimal');
      return;
    }

    // Find exact matching route by providers
    const newRoute = row.routes?.find(r => r.providers.join(', ') === value);
    if (newRoute) {
      console.log('Selected route:', newRoute);
      setRows(current =>
        current.map(r =>
          r.swapid === row.swapid
            ? {
                ...r,
                selectedRoute: value,
                route: newRoute,
                expectedOut: newRoute.expectedBuyAmount,
                gasFee: COLUMN_MAPPING.gasFee.format(null, { route: newRoute, fromToken: r.fromToken })
              }
            : r
        )
      );
    }
    return;
  }

  // For all other fields, clear route-related data
  const mapping = COLUMN_MAPPING[field];
  if (!mapping) return;
  if (mapping.editor === 'readonly') return;

  try {
    switch (mapping.editor) {
      case 'tokenSelect':
        const token = await onOpenWindow('tokenchooser.exe', {
          modal: true,
          tokens
        });
        if (!token) return;
        value = token;
        break;

      case 'number':
        value = parseFloat(value);
        if (isNaN(value)) return;
        if (mapping.range) {
          const [min, max] = mapping.range;
          value = Math.max(min, Math.min(max, value));
        }
        break;

      case 'select':
        if (!mapping.options.includes(value)) return;
        break;

      case 'address':
        if (!validateField(field, value)) return;
        break;
    }

    // Update INI data
    const newIniData = updateIniField(row.iniData, mapping.iniField, mapping.parse(value));

    // Update row state with cleared route data
    setRows(current => 
      current.map(r => 
        r.swapid === row.swapid 
          ? { 
              ...r, 
              [field]: value,
              iniData: newIniData,
              // Clear route-related data
              routes: [],
              route: null,
              selectedRoute: null,
              expectedOut: '',
              gasFee: '',
              status: field === 'amountIn' ? 'Amount Updated' : 'Quote Required'
            }
          : r
      )
    );
    
    // Update selectedRow to trigger refresh
    setSelectedRow(prev => ({
      ...prev,
      [field]: value,
      iniData: newIniData,
      routes: [],
      route: null,
      selectedRoute: null,
      expectedOut: '',
      gasFee: '',
      status: field === 'amountIn' ? 'Amount Updated' : 'Quote Required'
    }));

  } catch (error) {
    console.error(`Error updating cell ${field}:`, error);
  }
};

// Modify handleCellSelect
const handleCellSelect = (row, field) => {
  // Always update selection
  setSelectedRow(row);
  setSelectedCell(field);

  // Only handle token dialog for non-empty rows
  if (!row.isEmpty && field === 'fromToken' && !isTokenDialogOpen) {
    const spareRow = rows.length === 0 || hasData(rows[rows.length - 1]) 
      ? null 
      : rows[rows.length - 1];
      
    if (spareRow) {
      setIsTokenDialogOpen(true);
    }
  }

  // Update balances for non-empty rows
  if (!row.isEmpty) {
    updateBalances(row, wallets, skClient).then(updatedRow => {
      if (updatedRow) {
        setSelectedRow(updatedRow);
      }
    });
  }

  // Scroll into view
  setTimeout(() => {
    const cell = document.querySelector('.cell_' + field + '_' + row.swapid);
    if (cell) {
      cell.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    }
  }, 0);
};

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
const handleTokenSelect = (token, currentTokenSetter, closeTokenDialog) => {
  // console.log('handleTokenSelect', token, currentTokenSetter);
  if (currentTokenSetter) {
    currentTokenSetter(token);
  }
  closeTokenDialog();
};

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

// Update the updateCell function to handle tokens properly
const updateCell = (row, field, value) => {


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
    
    // Update the current row
    updatedRows[index] = {
      ...row,
      [field]: value,
      iniData: newIniData
    };

    // If this edit creates data in the last row, add a new spare row
    if (isLastRow(current) && !hasData(row) && hasData(updatedRows[index])) {
      updatedRows.push({
        ...initialRowState,
        swapid: Date.now(),
        isEmpty: false
      });
    }
    
    return updatedRows;
  });

};

  const handleRowSelect = (row) => {
    setSelectedRow(row);
  };


const openTokenDialog = (setter) => {
  setCurrentTokenSetter(() => setter);
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

// Update startEditing to accept row and field instead of reading from state
const startEditing = (row, field) => {
  if (!row || !field) return;
  // For tokenSelect, open token dialog instead of direct editing
  const mapping = COLUMN_MAPPING[field];
  if (mapping.editor === 'tokenSelect') {
    setIsTokenDialogOpen(true);
    return;
  }
  const value = mapping.format 
    ? mapping.format(row[field], row) 
    : row[field];
  setEditValue(value || '');
  setSelectedRow(row);
  setSelectedCell(field);
  setIsEditing(true);
  setTimeout(() => editInputRef.current && editInputRef.current.focus(), 0);
};

  const commitEdit = () => {
    if (!isEditing || !selectedRow || !selectedCell) return;
    handleCellUpdate(selectedRow, selectedCell, editValue); 
    // Don't set editValue here since we'll get it from getSelectedValue next time
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
      //focus back on the cell
      document.querySelector('.cell_' + selectedCell + '_' + selectedRow.swapid).focus();

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
    
    // Immediately commit changes for route selection
    if (selectedCell === 'routes') {
      handleCellUpdate(selectedRow, selectedCell, newValue);
      // Ensure the select element reflects the current value
      if (editInputRef.current) {
        editInputRef.current.value = newValue;
      }
    }
  };

  useEffect(() => {
    if(selectedRow && selectedCell && selectedCell === 'routes'){
      setEditValue(selectedRow.selectedRoute || 'optimal');

    }else{
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

// Replace updateBalances function
const updateBalances = async (row) => {
  if (!row || !row.fromToken || !row.toToken || row.isEmpty) return null;
  
  const fromChain = row.fromToken.chain;
  const toChain = row.toToken.chain;
  const gasAsset = getGasAsset({chain: fromChain});

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
      const gasAsset = getGasAsset({chain});
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
    if(!tokenPrices){
      console.log('failed to get prices');
      return;
    }
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
        setLastBalanceUpdate(prev => ({...prev, [rowId]: now}));
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

// // Add near other utility functions
// const copyToCSV = (data, includeHeader = false) => {
//   const header = Object.keys(COLUMN_MAPPING).join(',');
//   const values = Object.keys(COLUMN_MAPPING).map(field => {
//     const value = data[field];
//     const mapping = COLUMN_MAPPING[field];
//     return mapping?.format ? mapping.format(value, data) : value || '';
//   }).join(',');
  
//   return includeHeader ? `${header}\n${values}` : values;
// };

const parseCSV = (text) => {
  const [header, ...lines] = text.trim().split('\n');
  const fields = header.split(',');
  
  return lines.map(line => {
    const values = line.split(',');
    return fields.reduce((obj, field, i) => {
      const mapping = COLUMN_MAPPING[field];
      if (mapping?.parse) {
        obj[field] = mapping.parse(values[i]);
      } else {
        obj[field] = values[i];
      }
      return obj;
    }, {});
  });
};

  console.log('rows', rows);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }} className="exora">
      <div style={{ display: 'flex', height: '30px', backgroundColor: '#ccc', padding: '0', paddingTop: '2px', paddingBottom: '2px', flexShrink: 0 }}>
        <ActionButton visible={true} disabled title="[coming soon] Exectute all swaps, when balance is available" icon="▶️"
        >Go All</ActionButton>
        <ActionButton visible={true} disabled title="[coming soon] Exectute swaps in order, when balance is available." icon="▶️"
        >Go in turn</ActionButton>
        <ActionButton visible={true} disabled title="[coming soon] Clear transaction details" icon="🔄"
        >Reset</ActionButton>
        <ActionButton visible={true} onClick={handleAddRow} icon="➕">New</ActionButton>
      </div>
      
      <EditBar style={{ flexShrink: 0 }}>
        <ActionButton 
          icon="▶️"
          visible={!!selectedRow}
          onClick={() => handleExecute(selectedRowRef.current)}
          disabled={selectedRow?.status === 'Running'}
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
            onClick={startEditing}
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
