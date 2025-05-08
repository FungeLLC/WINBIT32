import React, { useEffect, useCallback, useRef, useMemo } from 'react';
import { FeeOption, AssetValue } from '@swapkit/sdk';
import TokenChooserDialog from './TokenChooserDialog';
import ProgressBar from '../../win/ProgressBar';
import TitleBar from '../../win/TitleBar';
import MenuBar from '../../win/MenuBar';
import { saveAs } from 'file-saver';
import './styles/SwapComponent.css';

import './styles/SendFundsComponent.css';
import { useWindowSKClient } from '../../contexts/SKClientProviderManager';
import { useIsolatedState } from '../../win/includes/customHooks';
import { formatBalance } from './helpers/transaction';
import { getAssetValue } from './helpers/quote';
import { getTxnUrl } from './helpers/transaction';
import { generateSendReport } from './helpers/report';
import { Chain } from '@swapkit/helpers'




const SendFundsComponent = ({ providerKey, windowId, onOpenWindow, metadata, hashPath, sendUpHash }) => {
		var bigInt = require("big-integer");
		const { skClient, wallets, tokens, chainflipBroker } = useWindowSKClient(providerKey);
		const [recipientAddress, setRecipientAddress] = useIsolatedState(windowId, 'recipientAddress', '');
		const [amount, setAmount] = useIsolatedState(windowId, 'amount', '');
		const [selectedToken, setSelectedToken] = useIsolatedState(windowId, 'selectedToken', metadata.selectedToken || null);
		const [memo, setMemo] = useIsolatedState(windowId, 'memo', '');
		const [txUrl, setTxUrl] = useIsolatedState(windowId, 'txUrl', '');
		const [error, setError] = useIsolatedState(windowId, 'error', '');
		const [progress, setProgress]= useIsolatedState(windowId, 'progress', 0);
		const [iniData, setIniData]= useIsolatedState(windowId, 'iniData', '');
		const currentIniData = useRef(iniData);
		const [textareaActive, setTextareaActive] = useIsolatedState(windowId, 'textareaActive', false);
		const [maxAmount, setMaxAmount]= useIsolatedState(windowId, 'maxAmount', '');
		const [sendInProgress, setSendInProgress] = useIsolatedState(windowId, 'sendInProgress', false);
		const [showSwapini, setShowSwapini] = useIsolatedState(windowId, 'showSwapini', false);
		const [reportData, setReportData] = useIsolatedState(windowId, 'reportData', {});



		const [isTokenDialogOpen, setIsTokenDialogOpen] = useIsolatedState(windowId, 'isTokenDialogOpen', false);

		const openTokenDialog = () => {
			setIsTokenDialogOpen('send');
		};

		const handleTokenSelect = useCallback((token) => {
			setSelectedToken(token);
			console.log('Selected token:', token);
			setIsTokenDialogOpen(false);
		}, [setIsTokenDialogOpen, setSelectedToken]);

	const isCFStateFund = useMemo(() => {
		return recipientAddress.toLowerCase().substring(0, 2) === 'cf';
	}, [recipientAddress]);

		useEffect(() => {
			//get balance and set maxamount
			if (selectedToken) {
				const token = selectedToken;
				const wallet = wallets.find(w => w?.chain === token?.chain);
				const balance = wallet?.balance?.find(
					b => b.isSynthetic !== true && (b.chain + '.' + b.ticker.toUpperCase() === token.identifier.toUpperCase() || b.chain + '.' + b.symbol.toUpperCase() === token.identifier.toUpperCase()))
					|| wallet?.balance?.find(b => b.isSynthetic === true && b.symbol.toUpperCase() === token.identifier.toUpperCase());
				if (token) {
					console.log('Selected token:', token, 'wallet', wallet, 'Balance:', balance);
				}
				if (balance) {
					//const readableBalance = formatBigIntToSafeValue(bigInt(balance.bigIntValue), balance.decimal, balance.decimal);
					const readableBalance = Number(balance.bigIntValue) / Number(balance.decimalMultiplier);
					console.log('Readable balance:', readableBalance.toString(), Number(balance.bigIntValue) / Number(balance.decimalMultiplier), token.identifier);
					setMaxAmount(readableBalance.toString());
				} else {
					setMaxAmount('0');
				}
			}
		}, [selectedToken, wallets, bigInt, setMaxAmount]);



		const sendFunds = async () => {
			if (!selectedToken) {
				setError('No token selected');
				return;
			}

			const sendingWallet = wallets.find(wallet => wallet.chain === selectedToken.chain);

			if (!sendingWallet) {
				setError('No sending wallet available');
				return;
			}

			if (!recipientAddress) {
				setError('No recipient address');
				return;
			}

			if (!amount) {
				setError('Amount cannot be zero');
				return;
			}

			if (sendInProgress) {
				setError('Send in progress');
				return;
			}
			setError('Sending funds...');
			setSendInProgress(true);
			setError('');
			setTxUrl('');
			setProgress(0);

			const { assetValue, otherBits } = await getAssetValue(selectedToken, amount);


			console.log('Asset Value:', assetValue, otherBits);
			// setSendInProgress(false);return;

			// export type TransferParams = {
			// 	assetValue: AssetValue;
			// 	fee?: StdFee;
			// 	feeOptionKey?: FeeOption;
			// 	from: string;
			// 	memo?: string;
			// 	privkey?: Uint8Array;
			// 	recipient: string;
			// 	signer?: OfflineDirectSigner;
			// };

		
			let txData;
			let fn = sendingWallet.transfer;
			if(sendingWallet.chain === 'XRD'){
				fn = sendingWallet.transferToAddress;
			}
			if(isCFStateFund && selectedToken.identifier === 'ETH.FLIP-0x826180541412D574cf1336d22c0C0a287822678A'){

				//get chainflip wallet
				if (!chainflipBroker){
					setError('No chainflip broker available');
					return;
				}

				// evmToolbox,
				// 	stateChainAccount,
				// 	assetValue,

				const evmToolbox = wallets.find(wallet => wallet.chain === 'ETH');
				const chainflipWallet = wallets.find(wallet => wallet.chain === 'FLIP');
				const cfb = await chainflipBroker(chainflipWallet);

				if (!evmToolbox || !chainflipWallet || !cfb || !cfb.broker) {
					setError('No EVM Toolbox or Chainflip Wallet available');
					return;
				}

				console.log('EVM Toolbox:', evmToolbox, 'Chainflip Wallet:', chainflipWallet, 'chainflipBroker:', cfb);



				const res = await cfb.broker.fundStateChainAccount({
					evmToolbox,
					stateChainAccount: recipientAddress,
					assetValue,
					}
				);

				console.log('Fund State Chain Account:', res);
				setProgress(87);
				const explorerUrl = getTxnUrl(res, selectedToken.chain, skClient);
				console.log('Explorer URL:', explorerUrl);
				setTxUrl(explorerUrl);
				setProgress(100);
				return;


			}else if(recipientAddress.toLowerCase() === 'deposit'){
				fn = sendingWallet.deposit;
				txData = {
					assetValue: assetValue,
					from: sendingWallet.address,
					memo,
				};


			}else{
				txData = {
					assetValue: assetValue,
					from: sendingWallet.address,
					feeOptionKey: FeeOption.Average,
					memo,
					recipient: recipientAddress,
					setStatusTextMessage: setError,
				};

				if(sendingWallet.chain === 'SOL'){
					txData.isProgramDerivedAddress = true;
				}

			}
			
			setProgress(13);
			console.log('Sending funds:', txData, sendingWallet);
			setReportData({
				sendParams: { ...txData },
				ini: iniData?.trim(),
			});

			try { 
				const txID = await fn(txData);
				console.log('Transaction ID:', txID);
				setProgress(87);
				const explorerUrl = getTxnUrl(txID, selectedToken.chain, skClient);
				console.log('Explorer URL:', explorerUrl);

				//add tx info to reportData
				setReportData(prev => {
					return {
						...prev,
						result: {
							txID: txID,
							explorerUrl: explorerUrl
						}
					}
				});


				setProgress(93);
				setTxUrl(explorerUrl);
				setProgress(100);
			} catch (error) {
				setError(`Error sending funds: ${error.message}`);
				console.error('Error during transaction:', error);
				console.log('skClient', skClient);

				//add error to reportData
				setReportData(prev => {
					return {
						...prev,
						result: {
							error: error.message
						}
					}
				});


			}
			setTimeout(() => {
				setSendInProgress(false);
			}, 2000);
			
		};


		const updateIniData = () => {
			if (!textareaActive) {
				let data = `token=${selectedToken?.identifier || ''}
amount=${amount}
recipient=${recipientAddress}
memo=${memo}
; memo is only for THOR/Maya/Radix Chains
`;

				setIniData(data);
			}
		};

		useEffect(() => {
			if(iniData){
				//convert to query string style and sendUpHash
				const lines = iniData.split('\n');
				let query = '';
				lines.forEach(line => {
					const [key, value] = line.split('=');
					if (!key || !value) return;
					query += key + '=' + encodeURIComponent(value) + '&';
				});
				sendUpHash([query], windowId);
			}
		}, [iniData, sendUpHash, windowId]);

		const delayedParseIniData = (_iniData) => {
			setIniData(_iniData);
			currentIniData.current = _iniData;
			setTimeout(() => {
				parseIniData(_iniData);
			}, 1000);
		};

		const parseIniData = (data) => {
			if (data !== currentIniData.current) {
				console.log("Data mismatch, ignoring parse", data, iniData);
				return;
			}
			const lines = data.split('\n');
			lines.forEach(line => {
				if(line.startsWith(';')) return; // Ignore comments (lines starting with ;
				const [key, value] = line.split('=');
				switch (key.trim()) {
					case 'token':
						if(!wallets) return; // Wait for wallets to be loaded (if not already loaded
						const token = tokens.find(token => token.identifier === value.trim());
						if (token && token !== selectedToken) handleTokenSelect(token);
						break;
					case 'amount':
						setAmount(value.trim());
						break;
					case 'recipient':
						setRecipientAddress(value.trim());
						break;
					case 'memo':
						setMemo(value.trim());
						break;
					default:
						break;
				}
			});
		};

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
					saveAs(blob, 'send.ini.txt'); // Save file
					break;
				case 'copy':
					navigator.clipboard.writeText(currentText); // Copy to clipboard
					console.log('Copied:', currentText)
					break;
				case 'paste':
					navigator.clipboard.readText().then((clipboardText) => {
						setIniData(clipboardText); // Paste from clipboard
						delayedParseIniData(clipboardText);
					});
					break;
				default:
					console.log(`Unknown action: ${action}`);
					break;
			}
		}, [iniData]);

		// Menu structure defined within the component
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

		useEffect(() => {
			updateIniData();
		}, [selectedToken, amount, recipientAddress, memo, textareaActive]);


		// useEffect(() => {
		// 	if(hashPath && hashPath.length > 0){
		// 		const parts = hashPath[0].split('&');
		// 		let data = [];
		// 		parts.forEach(part => {
		// 			const line = part.split('=');
		// 			const key = line[0];
		// 			if(!key) return;
		// 			const val = decodeURIComponent(line[1]);
		// 			data.push(`${key}=${val}`);
		// 		});
		// 		delayedParseIniData(data.join('\n'));
		// 		//parseIniData(data.join('\n'));
		// 	}
		// }, []);


	useEffect(() => {
		if (hashPath && hashPath.length > 0 && tokens && tokens.length > 0) {
			setTextareaActive(true);

			const parts = hashPath[0].split('&');
			let data = [];
			parts.forEach(part => {
				const line = part.split('=');
				const key = line[0];
				if (!key) return;
				const val = decodeURIComponent(line[1]);
				data.push(`${key}=${val}`);
			});
			delayedParseIniData(data.join('\n'));


			setTimeout(() => {
				setTextareaActive(false);
			}, 1000);

			//parseIniData(data.join('\n'));
		}
	}, [tokens]);




		return (
			<>
				<div className="swap-toolbar">
					<button className='swap-toolbar-button' onClick={sendFunds} disabled={sendInProgress}>
						<div className='swap-toolbar-icon'>💸</div>
						Send
					</button>
					{txUrl ?
						<button className='swap-toolbar-button' onClick={() => {
							window.open(txUrl, '_blank');
						}}>
							<div className='swap-toolbar-icon' >⛓</div>
							View TX
						</button>
						: ''
					}
					{reportData && reportData.ini &&
						<button className='swap-toolbar-button' onClick={() => {
							generateSendReport(reportData, onOpenWindow);
						}}>
							<div className='swap-toolbar-icon' >📋</div>
							Log
						</button>



					}
				</div>
				{(error && error !== '') &&
					<div className='status-text'>
						{error}
					</div>
				}
			
				<div style={{ width: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }} className='swap-component'>

					<div style={{ display: (sendInProgress || txUrl ? 'flex' : 'none') }} className="swap-progress-container">
						{sendInProgress ? <div>
							<div className="swap-progress" onClick={() => {
								
								setSendInProgress(false);
								}
							}>
								{progress > 0 && <ProgressBar percent={progress} progressID={windowId} showPopup={true} />}
							</div>
						</div>
							: ''}


					</div>
				<div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '10px' }}>
						<div className="field-group token-select-group">
							<div className='token-select'>

								<button onClick={() => { setSendInProgress(false); openTokenDialog();}} className='select-button' style={{ minWidth: '130px', minHeight: '75px' }}>
									{selectedToken ? (
										<span className='token'>
											<img src={selectedToken.logoURI} alt={selectedToken.name} style={{ width: '20px', height: '20px', 'marginRight': '5px', marginLeft: '5px' }} />
											<span> <b>{selectedToken.ticker}</b> {selectedToken.name} on {selectedToken.chain} {(selectedToken?.ticker?.includes('/') ? ' (Synthetic)' : '')}
											</span>
										</span>
									) :
										<span className='token'>

											<div className='swap-toolbar-icon' >🔍</div> <b>Select...</b>
										</span>
									}
								</button>

							</div>
							</div>	


						<div className="field-group amt-box" style={{ marginBottom: 0, paddingLeft: '3px' }}>
							<div><label>Amount
								{selectedToken && (
									<div style={{ fontSize: '0.9em', fontWeight: 500 }}>
										{maxAmount} {selectedToken.ticker} Available
									</div>
								)}

							</label></div><div>
								{!sendInProgress ? (
									<>
										<input type="number" value={amount} onChange={e => setAmount(e.target.value)} />

									</>
								) : (
									amount
								)}</div>
						</div>
						<div className="field-group" style={{ marginTop: 0, paddingTop: 0, flexDirection: 'column' }}>
							{!sendInProgress ? (
								<>
									{maxAmount && <input type="range" min="0" max={maxAmount} value={amount} onChange={e => setAmount(e.target.value)} step={maxAmount / 100} />}
								</>
							) : (
								''
							)}
						</div>
					{ recipientAddress !== 'fund_state_chain' && recipientAddress !== 'deposit' &&
					<div className="field-group" title="Use 'deposit' to deposit to protocol (Thor/Maya)">
						<label>Recipient Address</label>
						<input type="text" value={recipientAddress} onChange={e => setRecipientAddress(e.target.value)} />
					</div>
					}
					{(selectedToken?.chain === 'THOR' || selectedToken?.chain === 'MAYA' || selectedToken?.chain === 'XRD')
						&& (
						<div className="field-group">
							<label>Memo (Optional, for Thor/Maya/Radix)</label>
							<input type="text" value={memo} onChange={e => setMemo(e.target.value)} />
						</div>
					)}
					{ (selectedToken && selectedToken.identifier === 'ETH.FLIP-0x826180541412D574cf1336d22c0C0a287822678A') &&

						<div className="field-group">
							<label>
									<input type="checkbox" value={(isCFStateFund)}
									onChange={e => setRecipientAddress(e.target.checked ? wallets.find(w => w.chain === 'FLIP').address : '')} 
									checked={isCFStateFund}
									/>
								Fund State Chain Account</label>
						</div>
					}
					{ (selectedToken && (selectedToken.identifier === 'MAYA.CACAO' || selectedToken.identifier === 'THOR.RUNE')) &&
						<div className="field-group">	
							<label>
								<input type="checkbox" value={(recipientAddress === 'deposit')}
								checked={recipientAddress === 'deposit'}
								onChange={e => setRecipientAddress(e.target.checked ? 'deposit' : '')} />
								Deposit to Protocol</label>
						</div>
					}
				</div>
					{showSwapini === false &&
						<button onClick={() => setShowSwapini(true)} style={{ padding: '8px' }}>Advanced...</button>
					}

					<div style={{
						marginLeft: '2px', marginRight: 0, border: '1px solid black', marginBottom: '2px', width: 'calc(100% - 5px)', overflowX: 'hidden',
						display: showSwapini ? 'flex' : 'none'
					}} className='inibox'>				<TitleBar title="send.ini" showMinMax={false} isActiveWindow={true} onContextMenu={() => {
						setShowSwapini(false)
					}
					} />
					<MenuBar menu={menu} windowId={windowId} onMenuClick={handleMenuClick} />
					<textarea
						value={iniData}
						onChange={e => delayedParseIniData(e.target.value)}
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
									delayedParseIniData(ev.target.result);
								};
								reader.readAsText(file);
							}
						}}
					/>
				</div>
				<TokenChooserDialog
					isOpen={isTokenDialogOpen}
					onClose={() => setIsTokenDialogOpen(false)}
					onConfirm={handleTokenSelect}
					wallets={wallets}
				/>
				</div></>
		);
		
	};

	export default SendFundsComponent;


