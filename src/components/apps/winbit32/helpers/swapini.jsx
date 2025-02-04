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

const getTokenBalance = (token, wallets) => {
  if (!token || !wallets) return 0;

  const chain = token.chain;

  const wallet = wallets.find(wallet => wallet.chain === chain);

  if (!wallet) return 0;

  const balance = wallet.balances.find(b => b.symbol === token.symbol);

  return balance ? balance.amount : 0;
};



// Column definitions with parsing/validation
export const COLUMN_MAPPING = {
  swapid: {
    title: 'Swap ID',
    editor: 'readonly',
    compact: true,
    iniField: 'swapid',
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
      // Format the balance based on the token's decimal multiplier
      const balance = Number(row.fromToken.balance.bigIntValue) / Number(row.fromToken.balance.decimalMultiplier);
      const usdValue = balance * (row.fromToken.usdValue || 0);
      return formatBalanceWithUSD(balance, usdValue);
    }
  },
  toToken: {
    iniField: 'token_to',
    title: 'To Token',
    editor: 'tokenSelect',
    compact: true,
    parse: (value) => value?.identifier,
    format: (value) => value?.identifier
  },
  currentOutBalance: {
    title: 'Balance',
    editor: 'readonly',
    compact: true,
    format: (value, row) => {
      if (!row?.toToken?.balance) return '0';
      const balance = Number(row.toToken.balance.bigIntValue) / Number(row.toToken.balance.decimalMultiplier);
      const usdValue = balance * (row.toToken.usdValue || 0);
      return formatBalanceWithUSD(balance, usdValue);
    }
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
  expectedOut: {
    title: 'Expected Out',
    editor: 'readonly',
    compact: true,
    format: (value) => value
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
      // Show route's streaming interval if available
      if (row?.route?.streamingSwap) {
        return row.route.streamingBlocks || '';
      }
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
      // Show route's number of swaps if available
      if (row?.route?.streamingSwap) {
        return row.route.streamingQuantity || '';
      }
      return value || '';
    }
  },
  gasFee: {
    title: 'Gas Fee',
    editor: 'readonly',
    compact: true,
    format: (value, row) => {
      if (!row?.route) return '';

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
      
      const gasAsset = getGasAsset({chain: row.fromToken?.chain});
      if (!gasAsset) return row.route.gasFee;

      return `${row.route.gasFee} ${gasAsset.symbol}`;
    }
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
          token.identifier.toLowerCase() === value.trim().toLowerCase()
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

// Update handleCellUpdate to handle streaming parameters
export const handleCellUpdate = async (row, field, value, setRows) => {
  // ...existing code...

  // For streaming parameters, trigger requote if manually edited
  if (field === 'streamingInterval' || field === 'streamingNumSwaps') {
    setRows(current => 
      current.map(r => 
        r.swapid === row.swapid 
          ? {
              ...r,
              [field]: value,
              iniData: newIniData,
              status: 'Quote Required - Streaming Parameters Changed',
              // Clear route but preserve other data
              route: {
                ...r.route,
                streamingSwap: true,
                streamingBlocks: field === 'streamingInterval' ? value : r.streamingInterval,
                streamingQuantity: field === 'streamingNumSwaps' ? value : r.streamingNumSwaps
              }
            }
          : r
      )
    );
    return;
  }

  // ...rest of existing code...
};