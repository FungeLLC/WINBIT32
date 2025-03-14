import { getGasAsset } from "@doritokit/helpers";

// Helper function to check if a row has transaction data
export const hasRowTxData = (row) => {
  if (!row) return false;
  
  return Boolean(
    row.reportData || 
    (row.txIds && row.txIds.length > 0) || 
    (row.explorerUrls && row.explorerUrls.length > 0) ||
    row.txHash ||
    row.txStatus === 'confirmed' ||
    row.txStatus === 'success' ||
    (row.status && (
      row.status.includes('Transaction sent') ||
      row.status.includes('Transaction confirmed') ||
      row.status.includes('completed successfully')
    ))
  );
};

// Function to execute all swaps in a batch
export const handleExecuteAll = async (
  rows,
  setRows,
  skClient,
  handleExecute,
  onOpenWindow,
  inOrder = false,
  refreshBalance = () => {},
  walletsRef = null
) => {
  // Get all non-empty rows that have quotes and don't have transaction data
  const validRows = rows.filter(
    (r) => 
      !r.isEmpty && 
      r.fromToken && 
      r.toToken && 
      r.amountIn && 
      r.route && 
      !r.swapInProgress &&
      !hasRowTxData(r) // Use the helper function
  );

  if (validRows.length === 0) {
    console.log("No valid rows to execute");
    return;
  }

  // First check all rows for gas and mark those with insufficient gas
  const checkGasForAllRows = async () => {
    // Clear any existing gas warnings
    setRows((current) =>
      current.map((r) => ({ ...r, gasWarning: false }))
    );
    
    for (const row of validRows) {
      const hasGas = await checkRowGas(row);
      if (!hasGas) {
        // Mark row with gas warning
        setRows((current) =>
          current.map((r) =>
            r.swapid === row.swapid
              ? { 
                  ...r, 
                  gasWarning: true, 
                  status: "Insufficient gas for transaction" 
                }
              : r
          )
        );
      }
    }
  };
  
  // Check if a row has sufficient gas
  const checkRowGas = async (row) => {
    try {
      // Refresh balances to get the latest gas balance
      await refreshBalance(row.fromToken.chain);
      
      // Get updated wallets
      const updatedWallets = walletsRef.current;
      
      // Find the wallet for this token
      const wallet = updatedWallets.find(w => w.chain === row.fromToken.chain);
      if (!wallet) return false;
      
      // Find gas balance
      const gasAsset = row.fromToken.chain ? getGasAsset({ chain: row.fromToken.chain }) : null;
      const gasBalance = gasAsset ? wallet.balance?.find(
        b => b.chain === gasAsset.chain && 
          (b.symbol === gasAsset.symbol || b.ticker === gasAsset.symbol)
      ) : null;
      
      // Check if gas balance exists and is greater than zero
      const hasEnoughGas = gasBalance ? 
        (typeof gasBalance === 'object' && gasBalance.bigIntValue
          ? Number(gasBalance.bigIntValue) > 0
          : Number(gasBalance) > 0)
        : false;
      
      return hasEnoughGas;
    } catch (error) {
      console.error("Error checking gas balance:", error);
      return false;
    }
  };

  // Run initial gas check
  await checkGasForAllRows();
  
  // Filter out rows with gas warnings for execution
  const rowsToExecute = validRows.filter(
    row => !rows.find(r => r.swapid === row.swapid)?.gasWarning
  );
  
  if (rowsToExecute.length === 0) {
    console.log("No rows with sufficient gas to execute");
    return;
  }

  // Set all rows to waiting status
  setRows((current) =>
    current.map((r) =>
      rowsToExecute.some((vr) => vr.swapid === r.swapid)
        ? { ...r, status: "Waiting for execution..." }
        : r
    )
  );

  // Create a batch report
  const batchReport = {
    startTime: new Date().toISOString(),
    totalSwaps: rowsToExecute.length,
    completedSwaps: 0,
    failedSwaps: 0,
    swapReports: []
  };

  // Function to check if a row has sufficient balance
  const hasSufficientBalance = (row) => {
    if (!row.fromToken?.balance) return false;
    
    // Get balance as number
    const balance = typeof row.fromToken.balance === 'object' && row.fromToken.balance.bigIntValue
      ? Number(row.fromToken.balance.bigIntValue) / Number(row.fromToken.balance.decimalMultiplier)
      : Number(row.fromToken.balance);
    
    // Get gas balance
    const gasBalance = row.gasBalance 
      ? (typeof row.gasBalance === 'object' && row.gasBalance.bigIntValue
        ? Number(row.gasBalance.bigIntValue) / Number(row.gasBalance.decimalMultiplier)
        : Number(row.gasBalance))
      : 0;
    
    // Check if we have enough balance for the swap
    return balance >= Number(row.amountIn) && gasBalance > 0;
  };

  // Function to refresh balances for a row
  const refreshRowBalances = async (row) => {
    try {
      // Get fresh wallet data
      await refreshBalance(row.fromToken.chain);
      
      // Get updated wallets
      const updatedWallets = walletsRef.current;
      
      // Find the wallet for this token
      const wallet = updatedWallets.find(w => w.chain === row.fromToken.chain);
      if (!wallet) return row;
      
      // Find the token balance
      const tokenBalance = wallet.balance?.find(
        b => b.isSynthetic !== true && 
          (b.chain + '.' + b.ticker.toUpperCase() === row.fromToken.identifier.toUpperCase() || 
          b.chain + '.' + b.symbol.toUpperCase() === row.fromToken.identifier.toUpperCase())
      ) || wallet.balance?.find(
        b => b.isSynthetic === true && 
          b.symbol.toUpperCase() === row.fromToken.identifier.toUpperCase()
      );
      
      // Find gas balance
      const gasAsset = row.fromToken.chain ? getGasAsset({ chain: row.fromToken.chain }) : null;
      const gasBalance = gasAsset ? wallet.balance?.find(
        b => b.chain === gasAsset.chain && 
          (b.symbol === gasAsset.symbol || b.ticker === gasAsset.symbol)
      ) : null;
      
      // Update row with new balances
      const updatedRow = {
        ...row,
        fromToken: {
          ...row.fromToken,
          balance: tokenBalance
        },
        gasBalance: gasBalance,
        // Clear gas warning if we now have gas
        gasWarning: gasBalance ? 
          (typeof gasBalance === 'object' && gasBalance.bigIntValue
            ? Number(gasBalance.bigIntValue) <= 0
            : Number(gasBalance) <= 0)
          : true
      };
      
      // Update the row in state
      setRows(current => 
        current.map(r => 
          r.swapid === row.swapid ? updatedRow : r
        )
      );
      
      return updatedRow;
    } catch (error) {
      console.error("Error refreshing balances:", error);
      return row;
    }
  };

  // Process rows one by one or in parallel based on inOrder parameter
  if (inOrder) {
    // Process rows in sequence
    for (const row of rowsToExecute) {
      let currentRow = row;
      
      // Wait for sufficient balance
      while (!hasSufficientBalance(currentRow)) {
        // Update status to waiting for balance
        setRows(current => 
          current.map(r => 
            r.swapid === currentRow.swapid 
              ? { 
                  ...r, 
                  status: "Waiting for sufficient balance..." 
                } 
              : r
          )
        );
        
        // Wait 15 seconds before checking again
        await new Promise(resolve => setTimeout(resolve, 15000));
        
        // Refresh balances
        currentRow = await refreshRowBalances(currentRow);
      }
      
      // Execute the swap
      try {
        await handleExecute(currentRow);
        
        // Update batch report
        batchReport.completedSwaps++;
        batchReport.swapReports.push({
          swapId: currentRow.swapid,
          fromToken: currentRow.fromToken.identifier,
          toToken: currentRow.toToken.identifier,
          amount: currentRow.amountIn,
          status: "completed"
        });
      } catch (error) {
        console.error(`Error executing swap for row ${currentRow.swapid}:`, error);
        
        // Update batch report
        batchReport.failedSwaps++;
        batchReport.swapReports.push({
          swapId: currentRow.swapid,
          fromToken: currentRow.fromToken.identifier,
          toToken: currentRow.toToken.identifier,
          amount: currentRow.amountIn,
          status: "failed",
          error: error.message || "Unknown error"
        });
      }
    }
  } else {
    // Process all rows in parallel with balance checking
    const processRow = async (row) => {
      let currentRow = row;
      
      // Wait for sufficient balance
      while (!hasSufficientBalance(currentRow)) {
        // Update status to waiting for balance
        setRows(current => 
          current.map(r => 
            r.swapid === currentRow.swapid 
              ? { 
                  ...r, 
                  status: "Waiting for sufficient balance..." 
                } 
              : r
          )
        );
        
        // Wait 15 seconds before checking again
        await new Promise(resolve => setTimeout(resolve, 15000));
        
        // Refresh balances
        currentRow = await refreshRowBalances(currentRow);
      }
      
      // Execute the swap
      try {
        await handleExecute(currentRow);
        
        // Update batch report
        batchReport.completedSwaps++;
        batchReport.swapReports.push({
          swapId: currentRow.swapid,
          fromToken: currentRow.fromToken.identifier,
          toToken: currentRow.toToken.identifier,
          amount: currentRow.amountIn,
          status: "completed"
        });
      } catch (error) {
        console.error(`Error executing swap for row ${currentRow.swapid}:`, error);
        
        // Update batch report
        batchReport.failedSwaps++;
        batchReport.swapReports.push({
          swapId: currentRow.swapid,
          fromToken: currentRow.fromToken.identifier,
          toToken: currentRow.toToken.identifier,
          amount: currentRow.amountIn,
          status: "failed",
          error: error.message || "Unknown error"
        });
      }
    };
    
    // Start processing all rows
    await Promise.all(rowsToExecute.map(processRow));
  }
  
  // Complete the batch report
  batchReport.endTime = new Date().toISOString();
  batchReport.duration = (new Date(batchReport.endTime) - new Date(batchReport.startTime)) / 1000;
  
  // Show batch report
  if (onOpenWindow) {
    onOpenWindow("notepad.exe", {
      content: JSON.stringify(batchReport, null, 2),
      filename: `batch_swap_report_${new Date().toISOString()}.json`
    });
  }
};

// Function to optimize swap chains for gas
export const optimizeForGas = async (
  rows,
  setRows,
  skClient,
  tokens,
  initialRowState,
  handleQuote
) => {
  // Get all non-empty rows that have quotes
  const validRows = rows.filter(
    (r) => 
      !r.isEmpty && 
      r.fromToken && 
      r.toToken && 
      r.amountIn && 
      r.route
  );

  if (validRows.length === 0) {
    console.log("No valid rows to optimize");
    return;
  }

  // First check all rows for gas and identify those with insufficient gas
  const rowsWithGasWarnings = [];
  
  for (const row of validRows) {
    // Refresh balances to get the latest gas balance
    await skClient.core.refreshBalance(row.fromToken.chain);
    
    // Get updated wallets
    const updatedWallets = skClient.core.getWallets();
    
    // Find the wallet for this token
    const wallet = updatedWallets.find(w => w.chain === row.fromToken.chain);
    if (!wallet) continue;
    
    // Find gas balance
    const gasAsset = row.fromToken.chain ? skClient.core.getGasAsset({ chain: row.fromToken.chain }) : null;
    if (!gasAsset) continue;
    
    const gasBalance = gasAsset ? wallet.balance?.find(
      b => b.chain === gasAsset.chain && 
        (b.symbol === gasAsset.symbol || b.ticker === gasAsset.symbol)
    ) : null;
    
    // Check if gas balance exists and is greater than zero
    const hasEnoughGas = gasBalance ? 
      (typeof gasBalance === 'object' && gasBalance.bigIntValue
        ? Number(gasBalance.bigIntValue) > 0
        : Number(gasBalance) > 0)
      : false;
    
    if (!hasEnoughGas) {
      // Find the gas token in the tokens list
      const gasToken = tokens.find(t => 
        t.chain === gasAsset.chain && 
        (t.symbol === gasAsset.symbol || t.ticker === gasAsset.symbol)
      );
      
      if (gasToken) {
        rowsWithGasWarnings.push({
          row,
          gasToken,
          index: rows.findIndex(r => r.swapid === row.swapid)
        });
      }
    }
  }
  
  if (rowsWithGasWarnings.length === 0) {
    console.log("No rows need gas optimization");
    return;
  }
  
  // Find swap chains (consecutive rows where output of one is input of next)
  const swapChains = [];
  let currentChain = [];
  
  for (let i = 0; i < validRows.length; i++) {
    const currentRow = validRows[i];
    
    if (currentChain.length === 0) {
      currentChain.push({ row: currentRow, index: rows.findIndex(r => r.swapid === currentRow.swapid) });
    } else {
      const lastRow = currentChain[currentChain.length - 1].row;
      
      // Check if this row continues the chain
      if (lastRow.toToken?.identifier === currentRow.fromToken?.identifier) {
        currentChain.push({ row: currentRow, index: rows.findIndex(r => r.swapid === currentRow.swapid) });
      } else {
        // This row starts a new chain
        if (currentChain.length > 1) {
          swapChains.push([...currentChain]);
        }
        currentChain = [{ row: currentRow, index: rows.findIndex(r => r.swapid === currentRow.swapid) }];
      }
    }
  }
  
  // Add the last chain if it exists
  if (currentChain.length > 1) {
    swapChains.push([...currentChain]);
  }
  
  // For each chain, check if any row has a gas warning
  const optimizedRows = [];
  
  for (const chain of swapChains) {
    // Check if any row in the chain has a gas warning
    const rowsWithWarning = chain.filter(({ row }) => 
      rowsWithGasWarnings.some(warning => warning.row.swapid === row.swapid)
    );
    
    if (rowsWithWarning.length === 0) continue;
    
    // Try to optimize this chain
    const optimized = await optimizeChain(chain, rowsWithGasWarnings, rows, setRows, skClient, tokens, initialRowState);
    if (optimized) {
      // Get the latest rows after optimization
      const latestRows = await new Promise(resolve => {
        setRows(current => {
          resolve(current);
          return current;
        });
      });
      
      // Find the optimized rows
      const optimizedRowIds = latestRows
        .filter(r => r.gasOptimized)
        .map(r => r.swapid);
      
      optimizedRows.push(...optimizedRowIds);
    }
  }
  
  // Also handle individual rows with gas warnings that aren't part of chains
  const individualRowsWithWarning = rowsWithGasWarnings.filter(
    warning => !swapChains.flat().some(chainItem => chainItem.row.swapid === warning.row.swapid)
  );
  
  for (const { row, gasToken, index } of individualRowsWithWarning) {
    // For individual rows, we can only add a new row to swap some tokens to gas
    const optimized = await addGasSwapRow(row, gasToken, index, rows, setRows, initialRowState);
    if (optimized) {
      // Get the latest rows after optimization
      const latestRows = await new Promise(resolve => {
        setRows(current => {
          resolve(current);
          return current;
        });
      });
      
      // Find the optimized rows
      const newOptimizedRowIds = latestRows
        .filter(r => r.gasOptimized)
        .map(r => r.swapid);
      
      optimizedRows.push(...newOptimizedRowIds);
    }
  }
  
  // If handleQuote is provided, automatically quote all optimized rows
  if (handleQuote && optimizedRows.length > 0) {
    // Get the latest rows
    const latestRows = await new Promise(resolve => {
      setRows(current => {
        resolve(current);
        return current;
      });
    });
    
    // Quote each optimized row
    for (const rowId of optimizedRows) {
      const row = latestRows.find(r => r.swapid === rowId);
      if (row) {
        await handleQuote(row);
      }
    }
  }
  
  // Show a summary of what was optimized
  if (optimizedRows.length > 0) {
    console.log(`Optimized ${optimizedRows.length} rows for gas`);
  } else {
    console.log("No rows were optimized for gas");
  }
};

// Helper function to optimize a swap chain
const optimizeChain = async (chain, rowsWithGasWarnings, rows, setRows, skClient, tokens, initialRowState) => {
  // First try to modify an intermediate swap to use the gas asset
  for (let i = 0; i < chain.length - 1; i++) {
    const currentRow = chain[i].row;
    const nextRow = chain[i + 1].row;
    
    // Check if the next row has a gas warning
    const hasGasWarning = rowsWithGasWarnings.some(warning => warning.row.swapid === nextRow.swapid);
    
    if (hasGasWarning) {
      // Get the gas token for the next row's chain
      const gasAsset = nextRow.fromToken.chain ? skClient.core.getGasAsset({ chain: nextRow.fromToken.chain }) : null;
      if (!gasAsset) continue;
      
      const gasToken = tokens.find(t => 
        t.chain === gasAsset.chain && 
        (t.symbol === gasAsset.symbol || t.ticker === gasAsset.symbol)
      );
      
      if (gasToken) {
        // Try to modify the current row to swap to the gas token instead
        const updatedRows = [...rows];
        const currentRowIndex = updatedRows.findIndex(r => r.swapid === currentRow.swapid);
        
        // Update the current row to swap to the gas token
        updatedRows[currentRowIndex] = {
          ...updatedRows[currentRowIndex],
          toToken: gasToken,
          status: "Modified for gas - needs quote",
          routes: [],
          route: null,
          expectedOut: null,
          gasOptimized: true
        };
        
        // Update the next row to swap from the gas token to the original target
        const nextRowIndex = updatedRows.findIndex(r => r.swapid === nextRow.swapid);
        const originalToToken = nextRow.toToken;
        
        updatedRows[nextRowIndex] = {
          ...updatedRows[nextRowIndex],
          fromToken: gasToken,
          status: "Modified for gas - needs quote",
          routes: [],
          route: null,
          expectedOut: null,
          gasOptimized: true
        };
        
        // Apply the updates
        setRows(updatedRows);
        return true;
      }
    }
  }
  
  // If we couldn't modify the chain, try adding a new row for gas
  for (let i = 0; i < chain.length; i++) {
    const currentRow = chain[i].row;
    
    // Check if this row has a gas warning
    const warningInfo = rowsWithGasWarnings.find(warning => warning.row.swapid === currentRow.swapid);
    
    if (warningInfo) {
      await addGasSwapRow(currentRow, warningInfo.gasToken, chain[i].index, rows, setRows, initialRowState);
      return true;
    }
  }
  
  return false;
};

// Helper function to add a gas swap row
const addGasSwapRow = async (row, gasToken, rowIndex, rows, setRows, initialRowState) => {
  // Calculate how much of the token to swap to gas (e.g., 10% of the amount)
  const amountForGas = parseFloat(row.amountIn) * 0.1; // 10% for gas
  const remainingAmount = parseFloat(row.amountIn) - amountForGas;
  
  // Create a new row for the gas swap
  const gasSwapRow = {
    ...initialRowState,
    swapid: Date.now(),
    fromToken: row.fromToken,
    toToken: gasToken,
    amountIn: amountForGas.toString(),
    status: "Added for gas - needs quote",
    gasOptimized: true
  };
  
  // Update the original row with the reduced amount
  const updatedRows = [...rows];
  updatedRows[rowIndex] = {
    ...updatedRows[rowIndex],
    amountIn: remainingAmount.toString(),
    status: "Amount reduced for gas - needs quote",
    gasOptimized: true
  };
  
  // Insert the new gas swap row before the original row
  updatedRows.splice(rowIndex, 0, gasSwapRow);
  
  // Apply the updates
  setRows(updatedRows);
  return true;
}; 