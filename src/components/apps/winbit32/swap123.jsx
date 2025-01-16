import React, { useState, useEffect } from 'react';
import DataTable from 'react-data-table-component';
import { useWindowSKClient } from '../../contexts/SKClientProviderManager';
import styled from 'styled-components';
import { parseIniData } from './helpers/handlers';

const ActionButton = styled.button`
  padding: 5px 10px;
  margin: 2px;
  cursor: pointer;
`;

const ProgressCell = styled.div`
  width: 100%;
  padding: 5px;
`;

const ProgressBar = styled.div`
  width: 100%;
  height: 20px;
  background: #eee;
  border-radius: 3px;
  overflow: hidden;
`;

const Progress = styled.div`
  width: ${props => props.percent}%;
  height: 100%;
  background: #4CAF50;
  transition: width 0.3s ease;
`;

const initialRowState = {
  swapid: null,
  iniData: '',
  route: null,
  fromToken: '',
  toToken: '',
  amountIn: '',
  expectedOut: '',
  status: 'New',
  progress: 0,
  progressText: ''
};

const Swap123 = ({ providerKey, windowId, programData, onOpenWindow }) => {
  const { skClient, tokens, wallets } = useWindowSKClient(providerKey);
  const [rows, setRows] = useState([]);

  // Use parseIniData from handlers to process row data
  const updateRowFromIni = (iniData) => {
    const displayData = { ...initialRowState };
    
    parseIniData(
      iniData,
      (token) => displayData.fromToken = token?.symbol || '',
      (token) => displayData.toToken = token?.symbol || '',
      (amount) => displayData.amountIn = amount,
      () => {},  // destination address
      () => {},  // fee option
      () => {},  // slippage
      () => {},  // selected route
      () => {},  // routes
      [], // routes array
      tokens
    );

    return displayData;
  };

  const handleEdit = (row) => {
    onOpenWindow('exchange.exe', {
      initialIniData: row.iniData,
      editMode: true,
      onSave: (newIniData, route) => {
        setRows(current => 
          current.map(r => 
            r.swapid === row.swapid 
              ? { 
                  ...r, 
                  iniData: newIniData,
                  route: route,
                  ...updateRowFromIni(newIniData),
                  status: 'Ready'
                }
              : r
          )
        );
      }
    });
  };

  const handleExecute = async (row) => {
    if (!row.route) {
      console.error('No route data available');
      return;
    }

    setRows(current => 
      current.map(r => 
        r.swapid === row.swapid 
          ? { ...r, status: 'Running', progress: 0 }
          : r
      )
    );

    try {
      const handleProgress = (progress, text) => {
        setRows(current => 
          current.map(r => 
            r.swapid === row.swapid 
              ? { ...r, progress, progressText: text }
              : r
          )
        );
      };

      await handleSwap({
        skClient,
        route: row.route,
        onProgress: handleProgress
      });

      setRows(current => 
        current.map(r => 
          r.swapid === row.swapid 
            ? { ...r, status: 'Complete', progress: 100 }
            : r
        )
      );

    } catch (error) {
      setRows(current => 
        current.map(r => 
          r.swapid === row.swapid 
            ? { ...r, status: 'Failed', error: error.message }
            : r
        )
      );
    }
  };

  const columns = [
    {
      name: 'Actions',
      cell: row => {
        if (row.status === 'Running') {
          return (
            <ProgressCell>
              <ProgressBar>
                <Progress percent={row.progress || 0} />
              </ProgressBar>
              <div>{row.progressText || 'Processing...'}</div>
            </ProgressCell>
          );
        }
        
        return (
          <>
            <ActionButton onClick={() => handleEdit(row)}>Edit</ActionButton>
            <ActionButton 
              onClick={() => handleExecute(row)}
              disabled={['Running', 'Approving'].includes(row.status)}
            >
              {row.status === 'Failed' ? 'Retry' : 'Execute'}
            </ActionButton>
          </>
        );
      },
      width: '150px'
    },
    { name: 'From', selector: row => row.fromToken },
    { name: 'To', selector: row => row.toToken },
    { name: 'Amount In', selector: row => row.amountIn },
    { name: 'Expected Out', selector: row => row.expectedOut },
    { name: 'Status', selector: row => row.status }
  ];

  const handleAddRow = () => {
    const newRow = {
      ...initialRowState,
      swapid: Date.now()
    };
    setRows(current => [...current, newRow]);
    handleEdit(newRow);
  };

  return (
    <div>
      <ActionButton onClick={handleAddRow}>Add Swap</ActionButton>
      <DataTable
        columns={columns}
        data={rows}
        pagination
        dense
      />
    </div>
  );
};

export default Swap123;