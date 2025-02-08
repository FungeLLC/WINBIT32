import { parseIniData } from './handlers';
import { parseCSVUnified } from './fileOps';

// Add a sanitisation helper to remove potentially dangerous HTML tags
const sanitizeValue = (value) => {
  return String(value).replace(/<[^>]*>/g, '');
};

export const copyToCSV = (rows, COLUMN_MAPPING, includeMetadata = true) => {
  const mappingKeys = Object.keys(COLUMN_MAPPING);
  let headersArr;
  if (includeMetadata) {
    const allKeys = new Set();
    rows.filter(r => !r.isEmpty).forEach(row => {
      Object.keys(row).forEach(key => allKeys.add(key));
    });
    const extraKeys = [...allKeys].filter(key => !mappingKeys.includes(key));
    headersArr = [...mappingKeys, ...extraKeys];
  } else {
    // Exclude metadata by using only keys in COLUMN_MAPPING
    headersArr = mappingKeys;
  }
  
  const headers = headersArr.map(key => {
    const title = COLUMN_MAPPING[key]?.title || key;
    return sanitizeValue(title);
  }).join(',');

  const values = rows.filter(r => !r.isEmpty).map(row =>
    headersArr.map(key => {
      const val = (COLUMN_MAPPING[key]?.format 
                     ? COLUMN_MAPPING[key].format(row[key], row) 
                     : row[key]) || '';
      return sanitizeValue(val);
    }).join(',')
  ).join('\n');

  return `${headers}\n${values}`;
};

export const generateIni = (row, COLUMN_MAPPING) => {
  return Object.entries(COLUMN_MAPPING)
    .filter(([_, mapping]) => mapping.iniField)
    .map(([field, mapping]) => {
      const value = row[field];
      // Sanitize value before saving to ini
      return `${mapping.iniField}=${sanitizeValue(value)}`;
    })
    .join('\n');
};

// Add COLUMN_MAPPING to handleClipboardPaste params
export const handleClipboardPaste = async (rows, firstEmptyRow, tokens, setRows, COLUMN_MAPPING) => {
  const text = await navigator.clipboard.readText();
  if (!text) {
    console.log('Nothing to paste');
    return;
  }

  console.log('Pasting:', text);

  // Try parsing as INI first
  if (!text.includes(',')) {
    try {
      // Create an object to collect the parsed data
      const parsed = {};
      
      // Use parseIniData with callbacks that update our object
      parseIniData(
        text,
        (token) => { parsed.fromToken = token },
        (token) => { parsed.toToken = token },
        (amount) => { parsed.amountIn = amount },
        (address) => { parsed.destinationAddress = address },
        (option) => { parsed.feeOption = option },
        (slip) => { parsed.slippage = slip },
        (route) => { parsed.selectedRoute = route },
        () => {}, // setRoutes
        [], // routes array
        tokens,
        (streaming) => { parsed.manualStreamingSet = streaming },
        (interval) => { parsed.streamingInterval = interval },
        (numSwaps) => { parsed.streamingNumSwaps = numSwaps }
      );

      if (Object.keys(parsed).length) {
        setRows(current => {
          const index = current.findIndex(r => r.swapid === firstEmptyRow.swapid);
          const newRows = [...current];
          newRows[index] = {
            ...firstEmptyRow,
            ...parsed,
            iniData: text,
            isEmpty: false,
            status: 'Ready'
          };
          return newRows;
        });
        return true;
      }
    } catch (err) {
      console.error('INI parse error:', err);
    }
  }

  // Use unified CSV parser for CSV data
  const { rows: parsed, mapping: updatedMapping } = parseCSVUnified(text, COLUMN_MAPPING);
  
  setRows(current => {
    const newRows = [...current];
    parsed.forEach(scannedRow => {
      newRows[firstEmptyRow ? firstEmptyRow.indexOf : newRows.length] = {
        ...scannedRow
      };
    });
    return newRows;
  });
  
  return true;
};
