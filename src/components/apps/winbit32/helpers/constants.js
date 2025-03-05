// Common constants for Exora component

// Initial state for a new row
export const initialRowState = {
  swapid: null,
  iniData: '',
  route: null,
  fromToken: '',
  toToken: '',
  slippage: 1,
  amountIn: '',
  expectedOut: '',
  status: '',
  isEmpty: false,
  affiliate: 'be',
  mayaAffiliate: 'be',
  thorAffiliate: 'be',
  license: true,
  locked: false,             // property for locking row
  swapInProgress: false,     // property for progress indication
  txIds: null,               // property to store transaction ids after swap completes
  reportData: null,          // property for report data
}; 