import { hasData, hasRowTxData } from './hooks/handleExecuteAll';
import { COLUMN_MAPPING } from './helpers/swapini';

// Mock the column mapping
jest.mock('./helpers/swapini', () => ({
  COLUMN_MAPPING: {
    fromToken: { editor: 'tokenSelect' },
    toToken: { editor: 'tokenSelect' },
    amountIn: { editor: 'number' },
    slippage: { editor: 'number' },
    swapid: { editor: 'readonly' },
    destinationAddress: { editor: 'address' },
    feeOption: { editor: 'select' },
  }
}));

describe('Exora utility functions', () => {
  describe('hasRowTxData', () => {
    it('returns true when reportData exists', () => {
      const row = {
        reportData: { someData: 'value' },
        txIds: null,
        explorerUrls: null
      };
      expect(hasRowTxData(row)).toBe(true);
    });

    it('returns true when txIds has items', () => {
      const row = {
        reportData: null,
        txIds: ['tx1', 'tx2'],
        explorerUrls: null
      };
      expect(hasRowTxData(row)).toBe(true);
    });

    it('returns true when explorerUrls has items', () => {
      const row = {
        reportData: null,
        txIds: null,
        explorerUrls: ['url1', 'url2']
      };
      expect(hasRowTxData(row)).toBe(true);
    });

    it('returns false when no transaction data exists', () => {
      const row = {
        reportData: null,
        txIds: null,
        explorerUrls: null
      };
      expect(hasRowTxData(row)).toBe(false);
    });

    it('returns false when row is null or undefined', () => {
      expect(hasRowTxData(null)).toBe(false);
      expect(hasRowTxData(undefined)).toBe(false);
    });

    it('returns false when txIds and explorerUrls are empty arrays', () => {
      const row = {
        reportData: null,
        txIds: [],
        explorerUrls: []
      };
      expect(hasRowTxData(row)).toBe(false);
    });
  });
}); 