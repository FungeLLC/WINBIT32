import { parseIniData } from './handlers';
import { parseCSVUnified } from './fileOps';

// Add a sanitisation helper to remove potentially dangerous HTML tags
const sanitizeValue = (value) => {
  return String(value).replace(/<[^>]*>/g, '');
};

export const copyToCSV = (rows, COLUMN_MAPPING, includeMetadata = true) => {
  // Filter out empty rows and get visible columns
  const validRows = rows.filter(r => !r.isEmpty);
  const columns = Object.entries(COLUMN_MAPPING)
    .filter(([_, mapping]) => mapping.title)
    .map(([field, mapping]) => ({
      field,
      title: mapping.title,
      mapping
    }));

  // Create headers row
  const headers = columns.map(col => sanitizeValue(col.title)).join(',');
  
  // Create data rows
  const dataRows = validRows.map(row =>
    columns.map(col => {
      const value = col.mapping.format 
        ? col.mapping.format(row[col.field], row)
        : row[col.field];
      
      // Handle status objects
      if (col.mapping.title === 'Status') {
        return sanitizeValue(value?.tooltip || value || '');
      }
      
      return sanitizeValue(value || '');
    }).join(',')
  ).join('\n');

  return `${headers}\n${dataRows}`;
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
