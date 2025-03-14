import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Connection, VersionedTransaction, Keypair, PublicKey } from '@solana/web3.js';
import fetch from 'cross-fetch';
import bs58 from 'bs58';
import ProgressBar from '../../../win/ProgressBar';
import DataTable, { defaultThemes } from 'react-data-table-component';
import { useWindowSKClient } from '../../../contexts/SKClientProviderManager';
import { useIsolatedState } from '../../../win/includes/customHooks';
import './styles/JupiterSwapComponent.css';
import '../styles/SwapComponent.css';
import TitleBar from '../../../win/TitleBar';
import MenuBar from '../../../win/MenuBar';
import { saveAs } from 'file-saver';

const JupiterSwapComponent = ({ providerKey, windowId }) => {
	const { wallets } = useWindowSKClient(providerKey);
	const [contractAddress, setContractAddress] = useIsolatedState(windowId, 'contractAddress', '');
	const [wallet, setWallet] = useState(null);
	const [quoteResponse, setQuoteResponse] = useState(null);
	const [swapInProgress, setSwapInProgress] = useIsolatedState(windowId, 'swapInProgress', false);
	const [progress, setProgress] = useIsolatedState(windowId, 'progress', 0);
	const [statusText, setStatusText] = useIsolatedState(windowId, 'statusText', '');
	const [tokens, setTokens] = useIsolatedState(windowId, 'tokens', []);
	const [iniData, setIniData] = useIsolatedState(windowId, 'iniData', '');
	const currentIniData = useRef(iniData);
	const [textareaActive, setTextareaActive] = useIsolatedState(windowId, 'textareaActive', false);
	const [showSwapini, setShowSwapini] = useIsolatedState(windowId, 'showSwapini', false);
	const [dexTokens, setDexTokens] = useState([]);
	const [amount, setAmount] = useState(0);
	const [autoBuy, setAutoBuy] = useState(false);
	const [slippage, setSlippage] = useState(50);
	const [connection, setConnection] = useState(null);

	useEffect(() => {
	// Setup Solana connection
		const c = new Connection('https://solana-rpc.publicnode.com');

		setConnection(c);
	}, []);




	// Fetch tokens owned by the user
	const fetchTokens = useCallback(async () => {
		if (!wallets || wallets.length === 0) return;
		const userWallet = wallets.find((wallet) => wallet.chain === 'SOL');
		if (!userWallet) return;
		console.log('Fetching tokens for wallet:', userWallet);
		try {
			const publicKey = new PublicKey(userWallet.address);
			const TOKEN_PROGRAM_ID = new PublicKey(
				'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'
			);
			const TOKEN_2022_PROGRAM_ID = new PublicKey(
				'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb'
			);

			// const RAYDIUM_PROGRAM_ID = new PublicKey(
			// 	'srmqPvymJeFKQ4zGQed1GFppgkRHL9kaELCbyksJtPX'
			// );

			const response = await connection.getTokenAccountsByOwner(publicKey, {
				programId: TOKEN_PROGRAM_ID,
			});

			const response2 = await connection.getTokenAccountsByOwner(publicKey, {
				programId: TOKEN_2022_PROGRAM_ID,
			});

			// const response3 = await connection.getTokenAccountsByOwner(publicKey, {
			// 	programId: RAYDIUM_PROGRAM_ID,
			// });


			
			console.log('Token accounts:', response.value, response2.value, publicKey);

			const tokenData = response.value.map((accountInfo) => ({
				pubkey: accountInfo.pubkey.toBase58(),
				amount: accountInfo.account.data.parsed.info.tokenAmount.uiAmount,
			}));

			const tokenData2 = response2.value.map((accountInfo) => ({
				pubkey: accountInfo.pubkey.toBase58(),
				amount: accountInfo.account.data.parsed.info.tokenAmount.uiAmount,
			}));

			setTokens(tokenData.concat(tokenData2));

		} catch (error) {
			console.error('Error fetching tokens:', error);
		}
	}, [wallets, connection]);

	// Wallet setup (replace PRIVATE_KEY with your actual key for testing)
	useEffect(() => {
		if (!wallets || wallets.length === 0) return;
		const userWallet = wallets.find((wallet) => wallet.chain === 'SOL');
		if (!userWallet) return;
		setWallet(userWallet);
		
		const t = setTimeout(() => {
			fetchTokens();
		}, 1000);

		return () => clearTimeout(t);

	}, [wallets, connection]);


	// Fetch trending and new tokens from Dexscreener
	const fetchDexTokens = async () => {
		try {
			const response = await fetch('https://api.dexscreener.com/latest/dex/tokens');
			const data = await response.json();
			setDexTokens(data.pairs.slice(0, 10)); // Get top 10 trending tokens
		} catch (error) {
			console.error('Error fetching Dexscreener tokens:', error);
		}
	};

	const getQuote = async () => {
		if (!contractAddress || !wallet) {
			setStatusText('Missing wallet or contract address');
			return;
		}
		const quoteResponse = await (
			await fetch(`https://quote-api.jup.ag/v6/quote?inputMint=So11111111111111111111111111111111111111112&outputMint=${contractAddress}&amount=${amount * 1000000000}&slippageBps=50&feeBps=32`)
		).json();
		setQuoteResponse(quoteResponse);
		return quoteResponse;
	};

	// Handle swap
	const handleSwap = async () => {
		if (!contractAddress || !wallet) {
			setStatusText('Missing wallet or contract address');
			return;
		}

		setSwapInProgress(true);
		setProgress(10);
		setStatusText('Swapping SOL to target token...');

		try {
			// Get quote for SOL to target token with a commission of 0.32% (32 basis points)
			const quoteResponse = await getQuote();

			setProgress(13);

			// Get serialized swap transaction
			const { swapTransaction } = await (
				await fetch('https://quote-api.jup.ag/v6/swap', {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json'
					},
					body: JSON.stringify({
						quoteResponse,
						userPublicKey: wallet.publicKey.toString(),
						wrapAndUnwrapSol: true,
						feeAccount: '4pfsXs1wtEZEMHczp3DyyhKvL5ijVvfGqj6jLGC8Xbio' // Replace with your own fee wallet public key
					})
				})
			).json();
			setProgress(50);

			// Deserialize and sign the transaction
			const swapTransactionBuf = Buffer.from(swapTransaction, 'base64');
			const transaction = VersionedTransaction.deserialize(swapTransactionBuf);
			const res = await wallet.signAndSendTransaction(transaction);
			console.log('Transaction result:', res);
			setProgress(80);

			// Execute the transaction
			const latestBlockHash = await connection.getLatestBlockhash();
			const rawTransaction = transaction.serialize();
			const txid = await connection.sendRawTransaction(rawTransaction, {
				skipPreflight: true,
				maxRetries: 2
			});
			await connection.confirmTransaction({
				blockhash: latestBlockHash.blockhash,
				lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
				signature: txid
			});
			setProgress(100);
			setStatusText(`Transaction successful: https://solscan.io/tx/${txid}`);
		} catch (error) {
			setStatusText(`Error during swap: ${error.message}`);
			console.error('Swap Error:', error);
		} finally {
			setSwapInProgress(false);
		}
	};

	const updateIniData = () => {
		if (!textareaActive) {
			let data = `contractAddress=${contractAddress}
slippage=${slippage} #bps, ie 50 = 0.5%`;
			setIniData(data);
		}
	};

	const parseIniData = (data) => {
		const lines = data.split('\n');
		const iniData = {};
		lines.forEach((line) => {
			const parts = line.split('=');
			if (parts.length === 2) {
				iniData[parts[0].trim()] = parts[1].split('#')[0].trim();
			}
		});
		if(iniData.amount && amount !== iniData.amount) setAmount(iniData.amount);
		if(iniData.slippage && slippage !== iniData.slippage) setSlippage(iniData.slippage);
		if(iniData.contractAddress && contractAddress !== iniData.contractAddress) setContractAddress(iniData.contractAddress);

	};


	useEffect(() => {
		if (currentIniData.current !== iniData) {
			currentIniData.current = iniData;
			parseIniData(iniData);
		}
	}, [iniData]);



	useEffect(() => {
		updateIniData();
	}, [contractAddress, textareaActive]);

	const handleTextareaFocus = () => {
		setTextareaActive(true);
	};

	const handleTextareaBlur = () => {
		setTextareaActive(false);
		updateIniData(); // Ensure INI data is updated when textarea is no longer active
	};

	// Handle menu click events
	const handleMenuClick = useCallback((action) => {
		const currentText = iniData;

		switch (action) {
			case 'open':
				document.getElementById('fileInput' + windowId).click(); // Trigger file input
				break;
			case 'save':
				const blob = new Blob([currentText], { type: 'text/plain' });
				saveAs(blob, 'swap.ini.txt'); // Save file
				break;
			case 'copy':
				navigator.clipboard.writeText(currentText); // Copy to clipboard
				console.log('Copied:', currentText);
				break;
			case 'paste':
				navigator.clipboard.readText().then((clipboardText) => {
					setIniData(clipboardText); // Paste from clipboard
				});
				break;
			default:
				console.log(`Unknown action: ${action}`);
				break;
		}
	}, [iniData]);

	const menu = [
		{
			label: 'File',
			submenu: [
				{ label: 'Open...', action: 'open' },
				{ label: 'Save', action: 'save' },
			],
		},
		{
			label: 'Edit',
			submenu: [
				{ label: 'Copy All', action: 'copy' },
				{ label: 'Paste', action: 'paste' },
			],
		},
	];

	// Render
	return (
		<div className="jupiter-swap-component">
			<div className="swap-toolbar">
				<button onClick={handleSwap} disabled={swapInProgress || autoBuy}>Swap SOL</button>
				<label>
					<input
						type="checkbox"
						checked={autoBuy}
						onChange={() => setAutoBuy(!autoBuy)}
					/>
					Auto Buy
				</label>
			</div>
			{statusText && <div className="status-text">{statusText}</div>}
			{swapInProgress && <ProgressBar percent={progress} />}
			<div className="field-group">
				<label>Contract Address:</label>
				<input type="text" value={contractAddress} onChange={(e) => setContractAddress(e.target.value)} onBlur={() => autoBuy && handleSwap()} />
			</div>
			<div className="field-group">
				<label>Amount (SOL):</label>
				<input type="range" min="0" max="100" value={amount} onChange={(e) => setAmount(e.target.value)} />
				<span>{amount} SOL</span>
			</div>
			<div className="token-list">
				<DataTable
					title="Your Tokens"
					columns={[
						{ name: 'Token Address', selector: row => row.pubkey, sortable: true },
						{ name: 'Amount', selector: row => row.amount, sortable: true }
					]}
					data={tokens}
					customStyles={defaultThemes.default}
				/>
			</div>
			<div className="dex-tokens">
				<h3>Trending Tokens</h3>
				<ul>
					{dexTokens.map((token, index) => (
						<li key={index}>{token.name} - {token.priceUsd} USD</li>
					))}
				</ul>
			</div>
			<div className="inibox" style={{ display: showSwapini ? 'block' : 'none' }}>
				<TitleBar title="swap.ini" showMinMax={false} isActiveWindow={true} onContextMenu={() => setShowSwapini(false)} />
				<MenuBar menu={menu} windowId={windowId} onMenuClick={handleMenuClick} />
				<textarea
					value={iniData}
					onChange={e => setIniData(e.target.value)}
					style={{ width: '100%', height: '150px', boxSizing: 'border-box', border: 'none' }}
					onFocus={handleTextareaFocus}
					onBlur={handleTextareaBlur}
				/>
				<input
					type="file"
					id={"fileInput" + windowId}
					style={{ display: 'none' }} // Hidden file input for Open
					onChange={(e) => {
						const file = e.target.files[0];
						if (file) {
							const reader = new FileReader();
							reader.onload = (ev) => {
								setIniData(ev.target.result);
							};
							reader.readAsText(file);
						}
					}}
				/>
			</div>
			{showSwapini === false &&
				<button onClick={() => setShowSwapini(true)} style={{ padding: '8px' }}>Advanced...</button>
			}
		</div>
	);
};

export default JupiterSwapComponent;
