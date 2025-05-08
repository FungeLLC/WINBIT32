import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Connection } from '@solana/web3.js';
import { Raydium } from '@raydium-io/raydium-sdk-v2';
import ProgressBar from '../../win/ProgressBar';
import TitleBar from '../../win/TitleBar';

const SwapComponent = ({ connection, setTokenInfo, setProgress, ...props }) => {
    const [swapTo, setSwapTo] = useState('');
    const [amount, setAmount] = useState(0);
    const [swapInProgress, setSwapInProgress] = useState(false);

    useEffect(() => {
        if (swapTo) {
            // Fetch the token info here
            const raydium = new Raydium(connection);
            raydium.api.getTokenInfo([swapTo])
                .then(data => setTokenInfo(data))
                .catch(console.error);
        }
    }, [swapTo, setTokenInfo, connection]);

    const handleSwap = async () => {
        // Swap logic using Raydium SDK
        try {
            setSwapInProgress(true);
            setProgress(10);
            // Further logic...
            setProgress(100);
        } catch (error) {
            console.error(error);
        } finally {
            setSwapInProgress(false);
        }
    };

    return (
        <div>
            <TitleBar title="Swap Component" />
            <div>
                <input type="text" value={swapTo} onChange={(e) => setSwapTo(e.target.value)} placeholder="Token Contract Address" />
                <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount" />
                <button onClick={handleSwap} disabled={swapInProgress}>Swap</button>
                {swapInProgress && <ProgressBar percent={props.progress} />}
            </div>
        </div>
    );
};

export default SwapComponent;
