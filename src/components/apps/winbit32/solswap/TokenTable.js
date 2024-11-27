import React, { useEffect, useState } from 'react';
import DataTable, { defaultThemes } from 'react-data-table-component';
import './styles/TokenTable.css';

const TokenTable = ({ connection, programData }) => {
    const [positions, setPositions] = useState([]);

    useEffect(() => {
        const fetchUserTokens = async () => {
            if (!programData || !programData.wallets) return;
            const wallet = programData.wallets.find(wallet => wallet.chain === 'sol');
            if (!wallet) return;
            // Fetch tokens using connection and set positions
        };
        fetchUserTokens();
    }, [programData]);

    const columns = [
        { name: 'Token', selector: row => row.token },
        { name: 'Amount', selector: row => row.amount },
        { name: 'Action', cell: row => <button>Sell</button> },
    ];

    return (
        <DataTable
            title="Your Tokens"
            columns={columns}
            data={positions}
            dense
            customStyles={defaultThemes}
        />
    );
};

export default TokenTable;
