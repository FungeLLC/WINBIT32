import { to } from 'mathjs';
import { getTokenForProvider } from './token';
import { formatBalance, formatBalanceWithUSD } from './transaction';
import {
  Chain,
  ChainId,
  getGasAsset,
} from "@swapkit/helpers";

// Update toTitleCase to handle null/undefined
const toTitleCase = (str) => {
  if (!str) return '';
  return str.toString().replace(/\w\S*/g, txt => 
    txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
  );
};

export const getTokenBalance = (token, wallets) => {
  if (!token || !wallets) return 0;

  const chain = token.chain;

  const wallet = wallets.find(wallet => wallet.chain === chain);

  if (!wallet) return 0;

  if(!wallet.balance){
    console.log('Wallet balances not found', wallet);
    return 0;
  }

  const balance = wallet?.balance?.find(
    b => b.isSynthetic !== true && (
      (b.chain + '.' + (b.ticker?.toUpperCase() ?? '') === token.identifier?.toUpperCase() ?? '') || 
      (b.chain + '.' + (b.symbol?.toUpperCase() ?? '') === token.identifier?.toUpperCase() ?? '')
    )) || wallet?.balance?.find(
      b => b.isSynthetic === true && (b.symbol?.toUpperCase() ?? '') === (token.identifier?.toUpperCase() ?? '')
    );
  if(!balance){
    console.log('Token balance not found', wallet.balance, token);
    return 0;
  }

  // Use formatBalance to handle BigInt conversion properly
  if (typeof balance === 'object' && balance.bigIntValue) {
    // If balance is an object with BigInt values, format it properly
    return Number(balance.bigIntValue) / Number(balance.decimalMultiplier);
  }
  
  // Otherwise return the balance directly
  return balance || 0;
};


export const formatTokenBalance = (token, wallets) => {
  if (!token) return '0';

  const balance = getTokenBalance(token, wallets);
  const usdValue = balance * (token.usdValue || 0);
  return formatBalanceWithUSD(balance, usdValue);

};


// Column definitions with parsing/validation
export const COLUMN_MAPPING = {
  status: {
    title: 'Status',
    editor: 'readonly',
    compact: true,
    format: (value, row) => {
      // Check for rows with transaction data
      if (row.reportData || (row.txIds && row.txIds.length > 0) || (row.explorerUrls && row.explorerUrls.length > 0)) {
        return {
          color: 'purple',
          tooltip: 'Transaction data present - Reset to execute again'
        };
      }
      
      // Check for explicit gas warning flag
      if (row.gasWarning) {
        return { 
          color: 'red', 
          blink: true,
          tooltip: 'Insufficient gas for transaction'
        };
      }
      
      // Check for gas-optimized rows
      if (row.gasOptimized) {
        return {
          color: 'blue',
          tooltip: row.status || 'Row optimized for gas - needs quote'
        };
      }
      
      // Check for required fields
      if (!row.fromToken || !row.toToken || !row.amountIn) {
        return { color: 'red', tooltip: 'Missing required fields' };
      }

      // Check for errors
      if (row.status?.toLowerCase().includes('error')) {
        return { color: 'red', tooltip: row.status };
      }

      // Has quote but needs balance check
      if (row.route && row.expectedOut) {
        // Get balances as numbers
        const fromBalance = row.fromToken?.balance ? 
          Number(row.fromToken.balance.bigIntValue) / Number(row.fromToken.balance.decimalMultiplier) : 0;
        const gasBalance = row.gasBalance ? 
          Number(row.gasBalance.bigIntValue) / Number(row.gasBalance.decimalMultiplier) : 0;
        
        // Check if we have enough balance for the swap
        const hasEnoughBalance = fromBalance >= Number(row.amountIn);
        const hasEnoughGas = gasBalance > 0; // Simplified check, could be more precise

        if (!hasEnoughBalance || !hasEnoughGas) {
          return { 
            color: 'orange', 
            blink: true,
            tooltip: `Insufficient ${!hasEnoughBalance ? 'token' : 'gas'} balance. ` + 
                    `Have: ${!hasEnoughBalance ? fromBalance : gasBalance}`
          };
        }
        return { color: 'green', tooltip: row.status || 'Ready to swap' };
      }

      // Needs quote
      return { color: 'amber', tooltip: row.status || 'Quote required' };
    }
  },

  fromToken: {
    iniField: 'token_from',
    title: 'From Token',
    editor: 'tokenSelect',
    compact: true,
    parse: (value) => value?.identifier,
    format: (value) => value?.identifier
  },
  amountIn: {
    iniField: 'amount',
    title: 'Amount In',
    editor: 'number',
    compact: true,
    parse: (value) => parseFloat(value),
    format: (value) => value?.toString()
  },
  currentInBalance: {
    title: 'Balance',
    editor: 'readonly',
    compact: true,
    format: (value, row) => {
      if (!row?.fromToken?.balance) return '0';
      // Use the current fromToken for balance name
      const balance = Number(row.fromToken.balance.bigIntValue) / Number(row.fromToken.balance.decimalMultiplier);
      const usdValue = balance * (row.fromToken.usdValue || 0);
      return `${balance.toFixed(6)} ${row.fromToken.symbol || row.fromToken.ticker} (${usdValue.toFixed(2)} USD)`;
    }
  },
  toToken: {
    iniField: 'token_to',
    title: 'To Token',
    editor: 'tokenSelect',
    compact: true,
    parse: (value) => value?.identifier,
    format: (value) => value?.identifier || value
  },
  expectedOut: {
    title: 'Expected Out',
    editor: 'readonly',
    compact: true,
    format: (value) => value
  },
  currentOutBalance: {
    title: 'Balance',
    editor: 'readonly',
    compact: true,
    format: (value, row) => {
      if (!row?.toToken?.balance) return '0';
      // Use the current toToken for balance name
      const balance = Number(row.toToken.balance.bigIntValue) / Number(row.toToken.balance.decimalMultiplier);
      const usdValue = balance * (row.toToken.usdValue || 0);
      return `${balance.toFixed(6)} ${row.toToken.symbol || row.toToken.ticker} (${usdValue.toFixed(2)} USD)`;
    }
  },
  routes: {
    title: 'Routes',
    editor: 'select',
    compact: true,
    format: (value) => value
  },


  slippage: {
    iniField: 'slippage',
    title: 'Slippage',
    editor: 'number',
    range: [0.1, 100],
    compact: true,
    parse: (value) => parseFloat(value),
    format: (value) => value? `${value}%`: ''
  },
  feeOption: {
    iniField: 'fee_option',
    title: 'Fee Level',
    editor: 'select',
    options: ['Average', 'Fast', 'Very Fast'],
    format: (value) => value || 'Average',
    compact: true,
    parse: (value) => value.toLowerCase()
  },
  destinationAddress: {
    iniField: 'destination',
    title: 'Destination',
    editor: 'address',
    compact: false,
    validate: (value) => /^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(value)
  },


  gasAsset: {
    title: 'Gas Asset',
    editor: 'readonly', 
    compact: true,
    format: (value, row) => {
      if(!row || !row.fromToken) return '';
      const gasAsset = getGasAsset({chain: row?.fromToken?.chain});
      return gasAsset?.chain + '.' + gasAsset?.symbol;
    }
  },
  gasFee: {
    title: 'Gas Fee',
    editor: 'readonly',
    compact: true,
    format: (value, row) => {
      if (!row?.route) return '';
      if (!row.route.providers) return '';
      // For Thorchain/Maya routes, calculate total gas cost
      if (row.route.providers.some(p => ['THORCHAIN', 'THORCHAIN_STREAMING', 'MAYACHAIN', 'MAYACHAIN_STREAMING'].includes(p))) {
        const gas = row.route.fees?.gas;
        if (gas) {
          if (gas.units === 'satsperbyte') {
            // Estimate tx size (typical Bitcoin tx size)
            const estimatedTxSize = 250; // bytes
            const totalSats = gas.recommendedRate * estimatedTxSize;
            return `${(totalSats / 1e8).toFixed(8)} BTC`;
          }
          // Gas cost in native token for EVM chains
          if (gas.units === 'gwei') {
            // Estimate gas units needed (typical ERC20 transfer)
            const estimatedGasUnits = 65000;
            const totalGwei = gas.recommendedRate * estimatedGasUnits;
            return `${(totalGwei / 1e9).toFixed(6)} ETH`;
          }
          return `${gas.recommendedRate} ${gas.units}`;
        }
      }

      // For other routes
      if (typeof row.route.gasFee === 'undefined') return '';

      const gasAsset = getGasAsset({ chain: row.fromToken?.chain });
      if (!gasAsset) return row.route.gasFee;

      return `${row.route.gasFee} ${gasAsset.symbol}`;
    }
  },
  gasBalance: {
    title: 'Gas Balance',
    editor: 'readonly',
    compact: true,
    format: (value, row) => {
      if (!row?.fromToken) return '';
      const gasAsset = getGasAsset({chain: row.fromToken.chain});
      if (!gasAsset) return '0';
      const gasBalance = getTokenBalance(gasAsset);
      return formatBalance(row.gasBalance);
    }
  },
  streamingInterval: {
    iniField: 'streaming_interval',
    title: 'Block Interval',
    editor: 'number',
    compact: true,
    parse: (value) => parseInt(value),
    format: (value, row) => {
      // Only show route values if they exist
      if (row?.route?.streamingSwap) {
        return row.route.streamingBlocks?.toString() || '0';
      }
      // Otherwise show manually entered value
      return value || '';
    }
  },
  streamingNumSwaps: {
    iniField: 'streaming_num_swaps',
    title: 'Num Swaps',
    editor: 'number', 
    compact: true,
    parse: (value) => parseInt(value),
    format: (value, row) => {
      // Only show route values if they exist
      if (row?.route?.streamingSwap) {
        return row.route.streamingQuantity ? row.route.streamingQuantity.toString() : 'Auto';
      }
      // For non-streaming swaps show 1, otherwise show manual value
      return row?.route ? '1' : (value || '');
    }
  },

  swapid: {
    title: 'Swap ID',
    editor: 'readonly',
    compact: false,
    iniField: 'swapid',
  },
};

// Core INI parsing functions
export const parseIni = (iniString) => {
  const result = {};
  const lines = iniString.split('\n');
  
  lines.forEach(line => {
    if (line.startsWith(';')) return;
    const [key, value] = line.split('=');
    if (!key || !value) return;
    result[key.trim()] = value.trim();
  });
  
  return result;
};

export const generateIni = (data) => {
  return Object.entries(data)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
};

// Main parsing function from handlers.jsx
export const parseIniData = (
  data,
  setSwapFrom,
  setSwapTo,
  setAmount,
  setDestinationAddress,
  setFeeOption,
  setSlippage,
  setSelectedRoute,
  setRoutes,
  routes,
  tokens,
  setManualStreamingSet,
  setStreamingInterval,
  setStreamingNumSwaps,
  wallets // <-- Add wallets if needed for balance
) => {
  const lines = data.split('\n');
  let slippageVal;
  lines.forEach((line) => {
    if (line.startsWith(';')) return;

    const [key, value] = line.split('=');
    switch (key.trim()) {
      case 'token_from':
        const fromToken = tokens.find(token => 
          token.identifier?.toLowerCase() === value.trim().toLowerCase()
        );
        if (fromToken) {
          fromToken.identifier = fromToken.identifier.replace('0X', '0x');
          setSwapFrom(fromToken);
        }
        break;
      case 'token_to':
        const toToken = tokens.find(token =>
          token.identifier.toLowerCase() === value.trim().toLowerCase()
        );
        if (toToken) {
          toToken.identifier = toToken.identifier.replace('0X', '0x');
          setSwapTo(toToken);
        }
        break;
      case 'amount':
        setAmount(parseFloat(value));
        break;
      case 'destination':
        setDestinationAddress(value.trim());
        break;
      case 'fee_option':
        setFeeOption(value.trim());
        break;
      case 'slippage':
        slippageVal = parseFloat(value);
        if (!slippageVal || isNaN(slippageVal)) slippageVal = 1;
        setSlippage(slippageVal);
        break;
      case 'manual_streaming':
        setManualStreamingSet(value.trim() === 'true');
        break;
      case 'streaming_interval':
        setStreamingInterval(parseInt(value));
        break;
      case 'streaming_num_swaps':
        setStreamingNumSwaps(parseInt(value));
        break;
    case 'route':
      const routeValue = value.trim().toLowerCase() || 'optimal';
      const selectedRoute = routes.find(r => r.name.toLowerCase() === routeValue);
      setSelectedRoute(selectedRoute || routes.find(r => r.name.toLowerCase() === 'optimal'));
      break;
    }
  });

  // Attach wallet balances to fromToken/toToken
  if (tokens && wallets) {
    if (typeof setSwapFrom === 'function' && typeof setSwapTo === 'function') {
      // Replace setSwapFrom/fromToken with a matched wallet balance
      // ...existing code...
    }
  }
};

// Helper function for delayed parsing
export const delayedParseIniData = (
  iniData,
  setIniData,
  setSwapFrom,
  setSwapTo,
  setAmount,
  setDestinationAddress,
  setFeeOption,
  setSlippage,
  setSelectedRoute,
  setRoutes,
  routes,
  tokens,
  setManualStreamingSet,
  setStreamingInterval,
  setStreamingNumSwaps
) => {
  setIniData(iniData);
  setTimeout(() => {
    parseIniData(
      iniData,
      setSwapFrom,
      setSwapTo,
      setAmount,
      setDestinationAddress,
      setFeeOption,
      setSlippage,
      setSelectedRoute,
      setRoutes,
      routes,
      tokens,
      setManualStreamingSet,
      setStreamingInterval,
      setStreamingNumSwaps
    );
  }, 1000);
};

// Additional helper functions
export const updateIniField = (iniString, field, value) => {
  const data = parseIni(iniString);
  data[field] = value;
  return generateIni(data);
};

export const getDisplayValue = (field, value, row) => {
  const mapping = COLUMN_MAPPING[field];
  return mapping?.format ? mapping.format(value, row) : value;
};

export const parseFieldValue = (field, value) => {
  const mapping = COLUMN_MAPPING[field];
  return mapping?.parse ? mapping.parse(value) : value;
};

export const validateField = (field, value) => {
  const mapping = COLUMN_MAPPING[field];
  if (!mapping?.validate) return true;
  return mapping.validate(value);
};

// Add function to check if field is streaming related
export const isStreamingField = (field) => {
  return field === 'streamingInterval' || field === 'streamingNumSwaps';
};

// Add helper to check if row can be quoted
export const canGetQuote = (row) => {
  return row.fromToken && 
         row.toToken && 
         row.amountIn && 
         !isNaN(row.amountIn) && 
         parseFloat(row.amountIn) > 0;
};

// Add helper to check if field affects quote
export const isQuoteField = (field) => {
  return ['fromToken', 'toToken', 'amountIn', 'slippage', 'streamingInterval', 'streamingNumSwaps'].includes(field);
};