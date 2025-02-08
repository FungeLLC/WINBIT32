import React, { useCallback } from 'react';
import { chooseWalletForToken } from '../helpers/handlers';
import { getQuotes } from '../helpers/quotes';

export default function useExoraActions({ rows, setRows, skClient, wallets, tokens, chainflipBroker, onOpenWindow }) {
  const handleQuote = useCallback(async (row) => {
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
  
    const wallet = chooseWalletForToken(currentRow.fromToken, wallets);
  
    if (!wallet) {
      setRows(current => 
        current.map(r => 
          r.swapid === currentRow.swapid
            ? { ...r, status: 'No wallet available for selected token' }
            : r
        )
      );
      return;
    }
  
    setRows(current => 
      current.map(r => 
        r.swapid === currentRow.swapid
          ? { ...r, status: 'Quoting...' }
          : r
      )
    );

    const destination = currentRow.destinationAddress?.trim() || wallet.address;

    try {
      // Ensure streaming parameters are properly formatted for the quote
      const streamingInterval = currentRow.streamingInterval || undefined;
      const streamingNumSwaps = currentRow.streamingNumSwaps || undefined;
      
      // Only pass streaming parameters if they're actually set
      const streamingParams = streamingInterval || streamingNumSwaps ? {
        streamingInterval,
        streamingNumSwaps
      } : {};

      const routes = await getQuotes(
        currentRow.fromToken,
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
                      selectedRoute: 'optimal', // Always default to optimal route
                      route: bestRoute,
                      expectedOut: bestRoute.expectedBuyAmount,
                      status: 'Quote Ready',
                      // Preserve existing streaming parameters if they exist
                      streamingInterval: bestRoute.streamingBlocks || r.streamingInterval,
                      streamingNumSwaps: bestRoute.streamingQuantity || r.streamingNumSwaps
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
        null,
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
        ),
        ...Object.values(streamingParams), // Spread streaming parameters
        currentRow.streamingNumSwaps,     // Add this
        currentRow.streamingInterval      // Add this
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

  const handleExecute = useCallback(async (row) => {
    const updatedRow = { ...row, locked: true, swapInProgress: true };
    setRows(prevRows => prevRows.map(r => r.swapid === row.swapid ? updatedRow : r));

    try {
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
        null,
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

      if (swapResult) {
        setRows(prevRows => prevRows.map(r => r.swapid === row.swapid ? {
          ...r,
          swapInProgress: false,
          txIds: swapResult.txIds || [swapResult.txId]
        } : r));
      }
    } catch (err) {
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
  }, [skClient, wallets, setRows]);

  return {
    handleQuote,
    handleExecute
  };
}