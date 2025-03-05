import { copyToCSV } from './clipboard';
import * as XLSX from 'xlsx';
import { initialRowState } from './constants'; // Import initialRowState
import { hasData } from '../Exora'; // Add this import

// Helper for sanitizing data before save
const sanitizeForExport = (value) => {
  if (typeof value === 'bigint') {
    return value.toString();
  }
  if (typeof value === 'object' && value !== null) {
    return JSON.stringify(value, (key, val) => 
      typeof val === 'bigint' ? val.toString() : val
    );
  }
  return value;
};

// Helper to format cell value for export
const formatCellValue = (value, mapping) => {
  if (!value) return '';
  
  // Special handling for status cell
  if (mapping?.title === 'Status') {
    const formatted = mapping.format(null, value); // Pass null as value, full row as second param
    return formatted?.tooltip || formatted || value || '';
  }
  
  if (mapping?.editor === 'tokenSelect') {
    return value.identifier || '';
  }
  
  if (mapping?.format && typeof mapping.format === 'function') {
    const formatted = mapping.format(value);
    return typeof formatted === 'object' ? '' : String(formatted);
  }
  
  return String(value || '');
};

export const saveToFile = async (rows, COLUMN_MAPPING, type = 'csv') => {
  // Only include non-empty rows that have actual data
  const validRows = rows.filter(r => !r.isEmpty && hasData(r));
  
  if (type === 'csv') {
    // Get visible columns and their titles
    const columns = Object.entries(COLUMN_MAPPING)
      .filter(([_, mapping]) => mapping.title) 
      .map(([field, mapping]) => ({
        field,
        title: mapping.title,
        mapping
      }));

    // Create CSV header row
    const headers = columns.map(col => col.title).join(',');
    
    // Create data rows with null checks
    const dataRows = validRows.map(row => 
      columns.map(col => {
        try {
          return formatCellValue(row[col.field], col.mapping);
        } catch (err) {
          console.warn(`Error formatting cell ${col.field}:`, err);
          return '';
        }
      }).join(',')
    );
    
    // Combine headers and data
    const csv = [headers, ...dataRows].join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `swaps_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    return;
  }

  if (type === 'xlsx') {
    const wb = XLSX.utils.book_new();
    
    // Main data sheet - only include visible columns
    const columns = Object.entries(COLUMN_MAPPING)
      .filter(([_, mapping]) => mapping.title);
    
    const headers = columns.map(([_, mapping]) => mapping.title);
    const data = [headers];
    
    validRows.forEach(row => {
      const rowData = columns.map(([field, mapping]) => 
        formatCellValue(row[field], mapping)
      );
      data.push(rowData);
    });
    
    const ws = XLSX.utils.aoa_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, "Swaps");
    
    XLSX.writeFile(wb, `swaps_${new Date().toISOString().split('T')[0]}.xlsx`);
  }
};

export const loadFromFile = async (file, tokens, COLUMN_MAPPING, initialRowState, setRows) => {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();

		reader.onload = async (e) => {
			try {
				if (file.name.endsWith(".csv")) {
					const text = e.target.result;
					let metadata = [];

					// Extract metadata if present
					const metadataMatch = text.match(/^#METADATA=(.+)$/m);
					if (metadataMatch) {
						try {
							metadata = JSON.parse(atob(metadataMatch[1]));
						} catch (err) {
							console.warn("Failed to parse metadata:", err);
						}
					}

					// Parse CSV content (excluding metadata line)
					const csvContent = text.replace(/^#METADATA=.+\n/, "");
					const rows = parseCSVContent(csvContent, COLUMN_MAPPING, tokens);

					// Merge metadata back into rows
					const mergedRows = rows.map((row, i) => ({
						...initialRowState,
						...row,
						...(metadata[i] || {}),
					}));

					resolve(mergedRows);
				} else if (file.name.endsWith(".xlsx")) {
					const data = new Uint8Array(e.target.result);
					const workbook = XLSX.read(data, { type: "array" });

					// Read main data
					const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
					const csvContent = XLSX.utils.sheet_to_csv(firstSheet);
					const rows = parseCSVContent(csvContent, COLUMN_MAPPING, tokens);

					// Read metadata if present
					let metadata = [];
					if (workbook.SheetNames.includes("_Metadata")) {
						const metadataSheet = workbook.Sheets["_Metadata"];
						metadata = XLSX.utils.sheet_to_json(metadataSheet).map((m) => ({
							...m,
							reportData: JSON.parse(m.reportData || "{}"),
							route: JSON.parse(m.route || "{}"),
							routes: JSON.parse(m.routes || "[]"),
						}));
					}

					// Merge data
					const mergedRows = rows.map((row, i) => ({
						...initialRowState,
						...row,
						...(metadata[i] || {}),
					}));

					resolve(mergedRows);
				}
			} catch (err) {
				reject(err);
			}
		};

		if (file.name.endsWith(".csv")) {
			reader.readAsText(file);
		} else {
			reader.readAsArrayBuffer(file);
		}
	});
};

const parseCSVContent = (content, COLUMN_MAPPING, tokens) => {
  const [header, ...lines] = content.trim().split('\n');
  const headerFields = header.split(',').map(h => 
    Object.entries(COLUMN_MAPPING).find(([_, m]) => m.title === h.trim())?.[0]
  );
  
  const sheet =  lines.map(line => {
    const values = line.split(',');
    return headerFields.reduce((obj, field, i) => {
      if (!field) return obj;
      const mapping = COLUMN_MAPPING[field];
      if (mapping?.parse) {
		if (mapping.editor === 'tokenSelect'){
			const token = tokens.find((t) => t.identifier.toUpperCase() === values[i].toUpperCase());
			obj[field] = token; 
		}else{
			obj[field] = mapping.parse(values[i]);
		}
      } else {
        obj[field] = values[i];
      }
      return obj;
    }, {});
  });

  console.log('Parsed sheet:', sheet);

  return sheet;


};

// Add unified CSV parser for file operations and clipboard paste
export const parseCSVUnified = (text, COLUMN_MAPPING) => {
  // Simple helper for sanitisation
  const sanitizeValue = (value) => String(value).replace(/<[^>]*>/g, '');
  
  const [headerLine, ...lines] = text.trim().split('\n');
  const rawHeaders = headerLine.split(',').map(h => sanitizeValue(h.trim()));

  // Update mapping: add missing headers with default mapping
  const updatedMapping = { ...COLUMN_MAPPING };
  rawHeaders.forEach(h => {
    if (!Object.values(updatedMapping).some(mapping => mapping.title === h)) {
      updatedMapping[h] = { title: h };
    }
  });

  const parsedRows = lines.map(line => {
    const cells = line.split(',').map(cell => sanitizeValue(cell.trim()));
    const rowData = {};
    rawHeaders.forEach((h, idx) => {
      rowData[h] = cells[idx] || '';
    });
    return rowData;
  });
  
  return { rows: parsedRows, mapping: updatedMapping };
};

export const parseCsvRow = (csvText, COLUMN_MAPPING, tokens) => { // Add tokens parameter
  const lines = csvText.split('\n').filter(line => line.trim());
  if (lines.length < 2) return [];
  
  // Get raw header titles from CSV
  const rawHeaders = lines[0].split(',').map(s => s.trim());
  
  // Map titles to field names using COLUMN_MAPPING
  const fieldMap = Object.entries(COLUMN_MAPPING).reduce((acc, [field, mapping]) => {
    if (mapping.title) {
      acc[mapping.title.toLowerCase()] = {
        field,
        mapping
      };
    }
    return acc;
  }, {});
  
  // Parse each data row
  return lines.slice(1).map(line => {
    const values = line.split(',').map(s => s.trim());
    const rowData = { ...initialRowState };
    
    rawHeaders.forEach((title, idx) => {
      const mapping = fieldMap[title.toLowerCase()];
      if (mapping && values[idx]) {
        const value = values[idx];
        
        if (mapping.mapping.editor === 'tokenSelect' && value) {
          // Try to find matching token by identifier
          const token = tokens?.find(t => 
            t.identifier.toLowerCase() === value.toLowerCase()
          );
          rowData[mapping.field] = token || { identifier: value };
        } else if (mapping.mapping.parse) {
          rowData[mapping.field] = mapping.mapping.parse(value);
        } else {
          rowData[mapping.field] = value;
        }
      }
    });
    
    return hasData(rowData) ? { ...rowData, isEmpty: false } : null;
  }).filter(Boolean);
};
