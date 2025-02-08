import { copyToCSV } from './clipboard';
import * as XLSX from 'xlsx';

export const saveToFile = async (rows, COLUMN_MAPPING, type = 'csv') => {
  const validRows = rows.filter(r => !r.isEmpty);
  
  if (type === 'csv') {
    // Add metadata as a special commented section at top
    const metadata = validRows.map(row => ({
      swapid: row.swapid,
      iniData: row.iniData,
      reportData: row.reportData,
      route: row.route,
      routes: row.routes,
      // Add any other fields we want to preserve
    }));
    
    const metadataSection = `#METADATA=${btoa(JSON.stringify(metadata))}\n`;
    const csv = copyToCSV(validRows, COLUMN_MAPPING);
    const content = metadataSection + csv;
    
    const blob = new Blob([content], { type: 'text/csv' });
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
    
    // Main data sheet
    const headers = Object.entries(COLUMN_MAPPING).map(([_, mapping]) => mapping.title);
    const data = [headers];
    validRows.forEach(row => {
      const rowData = Object.entries(COLUMN_MAPPING).map(([field, mapping]) => {
        const value = row[field];
        return mapping?.format ? mapping.format(value, row) : value || '';
      });
      data.push(rowData);
    });
    const ws = XLSX.utils.aoa_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, "Swaps");

    // Metadata sheet
    const metadataSheet = XLSX.utils.json_to_sheet(validRows.map(row => ({
      swapid: row.swapid,
      iniData: row.iniData,
      reportData: JSON.stringify(row.reportData || {}),
      route: JSON.stringify(row.route || {}),
      routes: JSON.stringify(row.routes || []),
      // Add other fields to preserve
    })));
    XLSX.utils.book_append_sheet(wb, metadataSheet, "_Metadata");

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
					const rows = parseCSVContent(csvContent, COLUMN_MAPPING);

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
