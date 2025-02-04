import { nth } from 'lodash';
import styled from 'styled-components';
export const ActionButton = styled.button`
  padding: 5px;
  border: 2px outset #989e9e;
  background-color: #c3cbcb;
  flex: 1;
  max-width: 100px;
  visibility: ${props => props.visible ? 'visible' : 'hidden'};
  &:hover { background: #ccc; };
  &:before {
    content: '${props => props.icon}';
    margin-right: 5px;
  }
`;
export const ProgressCell = styled.div`
  width: 100%;
  padding: 5px;
`;
export const ProgressBar = styled.div`
  width: 100%;
  height: 20px;
  background: #eee;
  border-radius: 3px;
  overflow: hidden;
`;
export const Progress = styled.div`
  width: ${props => props.percent}%;
  height: 100%;
  background: #4CAF50;
  transition: width 0.3s ease;
`;

export const LetterCell = styled.div`

  text-align: center;
  font-size: 12px;
  cursor: pointer;
  width: 100%;
  border: 2px outset #989e9e;
  background-color:#c3cbcb;
  font-size: 1em;
  &:hover {
    background: #ccc;
  }
`;
export const HeaderCell = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;

  width: 100%;  
  align-items: center;
  justify-content: center;

`;
export const RowNumber = styled.button`
  width: 100%;
    text-align: center;
  font-size: 11px;
  white-space: nowrap; 
  cursor: pointer;
  width: 100%;
  border: 2px outset #989e9e;
  background-color:#c3cbcb;
  font-size: 1em;
  margin-top: -2px;
  height: calc(100% + 2px);
  &:hover {
    background: #ccc;
  }
`;
export const customStyles = {
  table: {
    style: {
      borderCollapse: 'collapse',
      display: 'block',
      whiteSpace: 'nowrap'
    },
  },
  rows: {
    style: {
      minHeight: '35px',
      backgroundColor: ({ isEmpty }) => isEmpty ? '#f8f8f8' : 'white',
      '&:hover': {
        cursor: 'pointer',
        backgroundColor: ({ isEmpty }) => isEmpty ? '#e8e8e8' : '#f0f0f0'
      }
    },
    selectedHighlightStyle: {
      ':nth-of-type(n)': {
        backgroundColor: '#f0f0f0',
      },
      '&:hover': {
        backgroundColor: '#f0f0f0'
      }
    },
  },
  cells: {
    style: {
      borderRight: '1px solid #e0e0e0',
      // borderBottom: '1px solid #e0e0e0',
      paddingLeft: 0,
      paddingRight: 0,
    },
  },
  headRow: {
    style: {
      backgroundColor: '#f5f5f5',
      // borderBottom: '2px solid #e0e0e0',
    },
  },
  headCells: {
    style: {
      fontSize: '14px',
      fontWeight: 'bold',
      color: '#333',
      borderRight: '1px solid #e0e0e0',
      paddingLeft: 0,
      paddingRight: 0,
    },
  },
  tableWrapper: {
    style: {
      display: 'block',
      width: '100%'
    }
  }
};
export const EditBar = styled.div`
  display: flex;
  align-items: justify;
  gap: 10px;
  padding: 0px;
  padding-top: 2px;
  padding-bottom: 2px;
  border-bottom: 1px solid #e0e0e0;
  background: #f5f5f5;
`;

// Separate styled components for input and select
export const EditInputBase = styled.input`
  flex: 1;
  font-family: monospace;
  font-size: 12px;
  padding: 4px;
  margin: 0;
  border: 1px solid #ccc;
  height: 20px;
`;

export const EditSelect = styled.select`
  flex: 1;
  font-family: monospace;
  font-size: 12px;
  padding: 4px;
  margin: 0;
  border: 1px solid #ccc;
  height: auto;
`;

export const SpreadsheetContainer = styled.div`
  border: 1px solid #e0e0e0;
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;

  // Force DataTable to fill container
  .rdt_Table {
    flex: 1;
    min-width: 100%;
  }

  // Remove DataTable's default scroll behavior
  .rdt_TableWrapper {
    height: 100%;
    overflow: unset !important;
  }
`;

export const InnerScrollContainer = styled.div`
  flex: 1;
  overflow: auto;
  min-height: 0;
  width: 100%;
  
  // Ensure content fills width
  > div {
    min-width: fit-content;
  }
`;

