import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useWindowSKClient } from '../../contexts/SKClientProviderManager';
import TokenChooserDialog from './TokenChooserDialog';
import { useIsolatedState } from '../../win/includes/customHooks';
import TitleBar from '../../win/TitleBar';
import './styles/SwapComponent.css';
import ProgressBar from '../../win/ProgressBar';
import { saveAs } from 'file-saver';
import MenuBar from '../../win/MenuBar';
import { Chain, ChainId, FeeOption } from '@swapkit/sdk';
import { getQuotes } from './helpers/quotes';
import { chooseWalletForToken, handleSwap, handleTokenSelect, updateDestinationAddress, delayedParseIniData, parseIniData } from './helpers/handlers';
import { checkTxnStatus, formatBalance } from './helpers/transaction';
import { handleApprove } from './helpers/handlers';
import DialogBox from '../../win/DialogBox';
import { amountInBigNumber } from './helpers/quote';
import { fetchTokenPrices } from './includes/tokenUtils';
import { generateSwapReport } from './helpers/report';
import { copyToClipboard, qrToast } from '../../win/includes/utils';
import { FaCopy, FaQrcode } from 'react-icons/fa';
import styled from 'styled-components';

// Add new styled components
const EditModeContainer = styled.div`
  padding: 10px;
  border: 1px solid #ccc;
  border-radius: 4px;
`;

const EditModeButtons = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 10px;
`;

const SwapComponent = ({
	providerKey,
	windowId,
	programData,
	appData,
	onOpenWindow,
	metadata,
	hashPath,
	sendUpHash,
	windowA
}) => {
	const { skClient, tokens, wallets, chainflipBroker, providers } = useWindowSKClient(providerKey);
	const { isRandomPhrase } = programData;
	const { license, embedMode } = appData || {}
	const [swapFrom, setSwapFrom] = useIsolatedState(windowId, 'swapFrom', metadata.swapFrom || null);
	const [swapFromAddress, setSwapFromAddress] = useIsolatedState(windowId, 'swapFromAddress', '');
	const [swapTo, setSwapTo] = useIsolatedState(windowId, 'swapTo', metadata.swapTo || null);
	const [amount, setAmount] = useIsolatedState(windowId, 'amount', 0);
	const [destinationAddress, setDestinationAddress] = useIsolatedState(windowId, 'destinationAddress', '');
	const [iniData, setIniData] = useIsolatedState(windowId, 'iniData', '');
	const [initialIniData, setInitialIniData] = useIsolatedState(windowId, 'initialIniData', metadata.initialIniData || '');
	const currentIniData = useRef(iniData);
	const [routes, setRoutes] = useIsolatedState(windowId, 'routes', []);
	const [selectedRoute, setSelectedRoute] = useIsolatedState(windowId, 'selectedRoute', 'optimal');
	const [feeOption, setFeeOption] = useIsolatedState(windowId, 'feeOption', 'Average');
	const [textareaActive, setTextareaActive] = useIsolatedState(windowId, 'textareaActive', false);
	const [slippage, setSlippage] = useIsolatedState(windowId, 'slippage', 3);
	const [isTokenDialogOpen, setIsTokenDialogOpen] = useIsolatedState(windowId, 'isTokenDialogOpen', false);
	const [currentTokenSetter, setCurrentTokenSetter] = useIsolatedState(windowId, 'currentTokenSetter', null);
	const [swapInProgress, setSwapInProgress] = useIsolatedState(windowId, 'swapInProgress', false);
	const [progress, setProgress] = useIsolatedState(windowId, 'progress', 0);
	const [showProgress, setShowProgress] = useIsolatedState(windowId, 'showProgress', false);
	const [explorerUrls, setExplorerUrls] = useIsolatedState(windowId, 'explorerUrls', '');
	const [txnHash, setTxnHash] = useIsolatedState(windowId, 'txnHash', []);
	const [txnStatus, setTxnStatus] = useIsolatedState(windowId, 'txnStatus', '');
	const currentTxnStatus = useRef(txnStatus);
	const [statusText, setStatusText] = useIsolatedState(windowId, 'statusText', '');
	const [quoteStatus, setQuoteStatus] = useIsolatedState(windowId, 'quoteStatus', (license ? '0.16% Affiliate fee' : 'Aff. fee 0.32% (0.16% for Licence holders)'));
	//const [quoteId, setQuoteId] = useIsolatedState(windowId, 'quoteId', '');
	const [maxAmount, setMaxAmount] = useIsolatedState(windowId, 'maxAmount', '0');
	const [txnTimer, setTxnTimer] = useIsolatedState(windowId, 'txnTimer', null);
	const [usersDestinationAddress, setUsersDestinationAddress] = useIsolatedState(windowId, 'usersDestinationAddress', '');
	const [showSwapini, setShowSwapini] = useIsolatedState(windowId, 'showSwapini', false);
	const [showOutputInputDialog, setShowOutputInputDialog] = useState(false);
	const [outputAmount, setOutputAmount] = useState('');
	const [outputType, setOutputType] = useState('expected');
	const [isStreamingSwap, setIsStreamingSwap] = useIsolatedState(windowId, 'isStreamingSwap', false);
	const [streamingInterval, setStreamingInterval] = useIsolatedState(windowId, 'streamingInterval', 10); //blocks
	const [streamingNumSwaps, setStreamingNumSwaps] = useIsolatedState(windowId, 'streamingNumSwaps', 0); //0 = optimal, otherwise max 20
	const [manualStreamingSet, setManualStreamingSet] = useIsolatedState(windowId, 'manualStreamingSet', false);
	const [reportData, setReportData] = useIsolatedState(windowId, 'reportData', {});
	const [thorAffiliate, setThorAffiliate] = useIsolatedState(windowId, 'thorAffiliate', metadata.tcName?.split('.')[0].toLowerCase().replace([/[^a-z0-9]/g], '') || 'be');
	const [mayaAffiliate, setMayaAffiliate] = useIsolatedState(windowId, 'mayaAffiliate', metadata.mayaName?.split('.')[0].toLowerCase().replace([/[^a-z0-9]/g], '') || 'be');
	const [editMode, setEditMode] = useIsolatedState(windowId, 'editMode', metadata.editMode || false);
	
	const onSave = metadata.onSave;
	const onCancel = metadata.onCancel;

	// console.log('Swap component metadata ini:', metadata);

	const txnTimerRef = useRef(txnTimer);

	const openTokenDialog = (setter, toFrom) => {
		setCurrentTokenSetter(() => setter);
		setIsTokenDialogOpen(toFrom || true);
	};

	const setExplorerUrl = useCallback((url) => {
		if (url === '') {
			setExplorerUrls([]);
			return;
		}
		//add to urls
		setExplorerUrls([...explorerUrls, url]);

	}, [explorerUrls, setExplorerUrls]);


	const secsToDisplay = useCallback((secs) => {
		var date = new Date(0);
		date.setSeconds(secs); // specify value for SECONDS here
		//console.log(secs, date.toISOString());
		var timeString = date.toISOString().substring(11, 19);
		return timeString;
	}, []);


	const closeTokenDialog = useCallback(() => {
		setIsTokenDialogOpen(false);
		setCurrentTokenSetter(null);
	}, []);

	const doGetQuotes = useCallback((force = false) => {
		if (swapInProgress && !force) return;

		const r = getQuotes(swapFrom,
			swapTo,
			amount,
			destinationAddress,
			slippage,
			setStatusText,
			setQuoteStatus,
			setRoutes,
			chooseWalletForToken,
			tokens,
			setDestinationAddress,
			setSelectedRoute,
			wallets,
			selectedRoute,
			license,
			(txnStatus === '') ? setReportData : () => { },
			iniData,
			thorAffiliate, mayaAffiliate,
			setThorAffiliate, setMayaAffiliate,
			streamingNumSwaps, streamingInterval,
			providers
		);


		// if(r==='retry'){
		// 	setTimeout(() => {
		// 		doGetQuotes();
		// 	}, 3000);
		// }

	}, [swapInProgress, swapFrom, swapTo, amount, destinationAddress, slippage, setStatusText, setQuoteStatus, setRoutes, tokens, setDestinationAddress, setSelectedRoute, wallets, mayaAffiliate, thorAffiliate, license, txnStatus, iniData, setReportData]);



	const updateIniData = () => {
		if (!textareaActive) {

			const route = (routes && routes.length !== 0 && selectedRoute && selectedRoute !== 'optimal' && selectedRoute !== -1) ? selectedRoute : 'optimal';

			//console.log('Selected route:', route, selectedRoute, routes);

			let data = `token_from=${swapFrom?.identifier || ''}
token_to=${swapTo?.identifier || ''}
amount=${amount}
destination=${destinationAddress}
route=${route}
fee_option=${feeOption || 'Average'}
slippage=${slippage}
`;

			if (manualStreamingSet || isStreamingSwap) {
				data +=
					`swap_interval=${streamingInterval}
swap_count=${streamingNumSwaps}
`;
			}

			setIniData(data);
		}
	};

	useEffect(() => {
		// Update the INI data whenever state changes#
		if (!tokens || tokens.length === 0) return;
		updateIniData();
	}, [swapFrom, swapTo, amount, destinationAddress, selectedRoute, textareaActive, slippage, tokens]);


	useEffect(() => {
		if (iniData && !editMode) {
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


	useEffect(() => {
		txnTimerRef.current = txnTimer;
	}, [txnTimer]);

	useEffect(() => {
		updateDestinationAddress(swapTo, wallets, setDestinationAddress, setUsersDestinationAddress);
	}, [swapTo, wallets]);

	useEffect(() => {

		//reset routes
		setRoutes([]);
		let timer = 0;

		const thisDestinationAddress =
			destinationAddress || chooseWalletForToken(swapTo, wallets)?.address;
		if (swapFrom && swapTo && amount && thisDestinationAddress) {

			setQuoteStatus('Requote Required');


			timer = setTimeout(() => {
				doGetQuotes();
			}, 3000);
		}

		return () => {
			clearTimeout(timer);
			// console.log("Clearing timer");
		};
	}, [swapFrom, swapTo, amount, destinationAddress, slippage, mayaAffiliate, thorAffiliate]);

	useEffect(() => {
		if (txnHash && txnHash.length > 0) checkTxnStatus(txnHash, txnHash[0], 0, swapInProgress, txnStatus, setStatusText, setSwapInProgress, setShowProgress, setProgress, setTxnStatus, setTxnTimer, txnTimerRef);
	}, [txnHash]);


	useEffect(() => {
		const token = swapFrom;
		const wallet = wallets.find(w => w?.chain === token?.chain);
		// console.log('Wallet:', wallet, 'Token:', token, 'Hash Path:', hashPath, 'Embed Mode:', embedMode, 'Random Phrase:', isRandomPhrase);
		if (hashPath && hashPath.length > 0 && hashPath[0].includes('CHAINFLIP') && embedMode && isRandomPhrase) {
			const r = routes.find(route => route.providers.includes('CHAINFLIP_DCA') || route.providers.includes('CHAINFLIP'));
			setSwapFromAddress(r?.cfQuote?.depositAddress || 'Click Open Channel to get deposit address');
		} else {
			setSwapFromAddress(wallet?.address || '');
		}
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
	}, [setMaxAmount, swapFrom, wallets]);

	const handleTextareaFocus = () => {
		setTextareaActive(true);
		console.log("Textarea active");
	};

	const handleTextareaBlur = () => {
		setTextareaActive(false);
		console.log("Textarea inactive");
	};

	const inputRef = useRef(windowId + '-search-text');

	const tokenChooserDialog = useMemo(() => {
		if (isTokenDialogOpen) {
			return <TokenChooserDialog
				isOpen={isTokenDialogOpen}
				onClose={() => setIsTokenDialogOpen(false)}
				onConfirm={token => {
					setManualStreamingSet(false);
					return handleTokenSelect(token, currentTokenSetter, () => setIsTokenDialogOpen(false));
				}
				}
				wallets={wallets}
				otherToken={swapFrom}
				windowId={windowId + '_token_chooser'}
				inputRef={inputRef}
			/>;
		}
		return null;
	}, [isTokenDialogOpen, wallets, swapFrom]);


	useEffect(() => {
		currentIniData.current = iniData;
	}, [iniData]);

	const handleMenuClick = useCallback((action) => {
		const currentText = currentIniData.current;
		console.log('currentText:', currentText);

		//if action is a function, call it
		if (typeof action === 'function') {
			action();
			return;
		}

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
					delayedParseIniData(clipboardText, setIniData, setSwapFrom, setSwapTo, setAmount, setDestinationAddress, setFeeOption, setSlippage, setSelectedRoute, setRoutes, routes, tokens,
						setManualStreamingSet,
						setStreamingInterval,
						setStreamingNumSwaps);
				});
				break;

			default:
				console.log(`Unknown action: ${action}`);
				break;
		}
	}, [currentIniData]);
	// console.log("skclient var", skClient);



	useEffect(() => {
		if(initialIniData && initialIniData.length > 0){
			setTextareaActive(true);

			console.log('Initial INI data:', initialIniData);
			setIniData(initialIniData);

			delayedParseIniData(initialIniData, setIniData, setSwapFrom, setSwapTo, setAmount, setDestinationAddress, setFeeOption, setSlippage, setSelectedRoute, setRoutes, routes, tokens,
				setManualStreamingSet,
				setStreamingInterval,
				setStreamingNumSwaps);


			setTimeout(() => {
				setTextareaActive(false);
				setInitialIniData('');
			}, 1000);

		}
		else if (hashPath && hashPath.length > 0 && tokens && tokens.length > 0 && !metadata.swapFrom && !metadata.swapTo) {
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
			delayedParseIniData(data.join('\n'), setIniData, setSwapFrom, setSwapTo, setAmount, setDestinationAddress, setFeeOption, setSlippage, setSelectedRoute, setRoutes, routes, tokens,
				setManualStreamingSet,
				setStreamingInterval,
				setStreamingNumSwaps);

			setTimeout(() => {
				setTextareaActive(false);
			}, 1000);

			//parseIniData(data.join('\n'));
		}
	}, [tokens]);



	const menu = React.useMemo(() => [
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
		}
	], []);

	const optimalRoute = useMemo(() => {
		if (routes && routes.length > 0) {
			return routes.find(({ optimal }) => optimal);
		}
		return null;
	}, [routes]);

	const handleRouteSelection = (event) => {
		setSelectedRoute(event.target.value);
	};

	const showHideSwapIni = () => {
		const swapIni = document.getElementById('swap-ini');
		if (swapIni.style.display === 'none') {
			swapIni.style.display = 'block';
		} else {
			swapIni.style.display = 'none';
		}
	};

	const renderOutputInputDialog = () => (
		<DialogBox
			title="Input Desired Output"
			icon="question"
			content={(
				<div>
					<label>
						<div>Output Amount Target:</div>
						<input
							type="number"
							value={outputAmount}
							onChange={e => setOutputAmount(e.target.value)}
							style={{ width: '100%' }}
						/>
					</label>
					<div style={{ marginTop: '10px' }}>
						<label>
							<input
								type="radio"
								value="expected"
								checked={outputType === 'expected'}
								onChange={() => setOutputType('expected')}
							/>
							Expected
						</label>
						<label style={{ marginLeft: '20px' }}>
							<input
								type="radio"
								value="minimum"
								checked={outputType === 'minimum'}
								onChange={() => setOutputType('minimum')}
							/>
							Minimum
						</label>
					</div>
				</div>
			)}
			onConfirm={handleOutputInputDialogConfirm}
			onCancel={() => setShowOutputInputDialog(false)}
			onClose={() => setShowOutputInputDialog(false)}
		/>
	);



	const handleOutputInputDialogConfirm = async () => {
		setShowOutputInputDialog(false);
		setManualStreamingSet(false);
		if (!outputAmount || !swapTo) {
			setStatusText('Please enter a valid output amount and select a token to swap to.');
			return;
		}

		try {
			setStatusText('Calculating best input amount...');
			setSwapInProgress(true);
			setProgress(0);
			setShowProgress(true);
			setStatusText('Calculating best input amount...');
			const { fromPrice, toPrice } = await fetchTokenPrices(swapFrom, swapTo);

			if (fromPrice === 0 || toPrice === 0) {

				throw new Error('Unable to fetch token prices');
			}
			setProgress(13);
			// Calculate initial bounds based on prices
			const initialInputAmount = (outputAmount * toPrice) / fromPrice;
			let lowerBound = initialInputAmount * 0.5; // Start with 50% of estimated amount
			let upperBound = initialInputAmount * 1.5; // Start with 150% of estimated amount
			let bestInputAmount = null;
			let bestRoute = null;
			const outputAmountBigInt = amountInBigNumber(outputAmount, swapTo.decimals);
			const outputAmountUSD = outputAmountBigInt.times(toPrice).div(fromPrice);
			console.log('Output amount USD:', outputAmountUSD.toString());

			let outputs = [];
			for (let i = 0; i < 10; i++) { // Limit to 10 iterations to avoid infinite loops
				const guessInputAmount = (lowerBound + upperBound) / 2;
				setAmount(guessInputAmount.toString());

				const r = await getQuotes(
					swapFrom,
					swapTo,
					guessInputAmount,
					destinationAddress,
					slippage,
					setStatusText,
					setQuoteStatus,
					setRoutes,
					chooseWalletForToken,
					tokens,
					setDestinationAddress,
					setSelectedRoute,
					wallets,
					selectedRoute,
					license,
					false,
					'',
					'be',
					'be',
					setThorAffiliate,
					setMayaAffiliate,
					streamingNumSwaps,
					streamingInterval,
					providers
				);

				setProgress(13 + (i * 7));
				if (!r || r.length === 0) {
					continue;
				}

				const optimalRoute = r.find(route => route.optimal);
				if (!optimalRoute) {
					throw new Error('No optimal route found.');
				}

				const outputKey = outputType === 'minimum' ? 'expectedBuyAmountMaxSlippage' : 'expectedBuyAmount';
				const outputValue = amountInBigNumber(optimalRoute[outputKey], swapTo.decimals);
				const outputValueUSD = outputValue.times(toPrice).div(fromPrice);
				console.log('Output value:', outputValue.toString(), outputAmountBigInt.toString(), outputValueUSD.toString());

				let diff = outputValue.minus(outputAmountBigInt);
				let diffUSD = outputValueUSD.minus(outputAmountUSD);
				console.log('Diff:', diff.toString());
				if (outputType !== 'minimum') {
					diff = diff.abs();
					diffUSD = diffUSD.abs();
				}
				const diffPercent = diff.dividedBy(outputAmountBigInt).times(100);
				console.log('Diff percent:', diffPercent.toString());
				if (diff.isGreaterThanOrEqualTo(0)) {
					outputs.push({ guessInputAmount, outputValue, diff, diffPercent, optimalRoute });
				}

				if ((diffPercent.isLessThanOrEqualTo(0.1) || diffUSD < 4) && diff.isGreaterThanOrEqualTo(0)) {
					console.log('Best input amount found:', guessInputAmount.toString());
					bestInputAmount = guessInputAmount;
					bestRoute = optimalRoute;
					break;
				} else if (outputValue.isGreaterThan(outputAmountBigInt)) {
					upperBound = guessInputAmount;
				} else {
					lowerBound = guessInputAmount;
				}
			}


			if (!bestInputAmount || !bestRoute) {
				if (outputs.length === 0) {
					throw new Error('No suitable outputs found.');
				}

				const optimalRoute = outputs.reduce((a, b) => {
					const aVal = a.diff.abs();
					const bVal = b.diff.abs();
					return aVal.isLessThanOrEqualTo(bVal) ? a : b;
				});
				bestInputAmount = optimalRoute.guessInputAmount;
				bestRoute = optimalRoute.optimalRoute;
			}


			if (bestRoute) {
				// setSwapFrom(bestRoute.sellAsset);
				// setSwapTo(bestRoute.buyAsset);
				setAmount(bestInputAmount.toString());
				setSelectedRoute(bestRoute.providers.join(', '));
				setStatusText('Best input amount calculated and set.');
			} else {
				setStatusText('Unable to find a suitable route.');
			}
		} catch (error) {
			setStatusText(`Error calculating best input amount: ${error.message}`);

		} finally {
			setSwapInProgress(false);
			setProgress(100);
			setShowProgress(false);
		}
	};


	useEffect(
		() => {
			const r = routes.find(route => selectedRoute === route.providers.join(', ') || (selectedRoute === 'optimal' && route.optimal === true));

			if (r) {
				//if chainflip set streaming
				if (r.providers.includes('CHAINFLIP_DCA') || r.providers.includes('CHAINFLIP')) {
					console.log('Chainflip route selected');
					if (r.cfQuote?.dcaParams?.numberOfChunks) {
						setIsStreamingSwap(true);
						if (!manualStreamingSet) {
							setStreamingInterval(r.cfQuote?.dcaParams?.chunkIntervalBlocks || 10);
							setStreamingNumSwaps(r.cfQuote?.dcaParams?.numberOfChunks || 10);
						}
					}

					if (embedMode && isRandomPhrase) {
						setSwapFromAddress(r.cfQuote?.depositAddress || 'Click Open Channel to get deposit address');
					}
					return;
				}




				const parts = r.memo?.split(":");

				if (parts && parts.length > 3) {
					const splitP3 = parts[3].split("/");
					if (splitP3.length > 1) {
						setIsStreamingSwap(true);
						if (!manualStreamingSet) {
							setStreamingInterval(parseInt(splitP3[1]));
							setStreamingNumSwaps(parseInt(splitP3[2]));
						}
					} else {
						setIsStreamingSwap(false);
					}
				} else {
					setIsStreamingSwap(false);
				}
			}
		}

		, [selectedRoute, routes, setStreamingInterval, setStreamingNumSwaps, setIsStreamingSwap, isRandomPhrase]);


	const handleSaveClick = () => {
		const oRoute =
			selectedRoute === "optimal" && routes.length > 0
				? routes.find(({ optimal }) => optimal) || routes[0]
				: routes.find((route) => route.providers.join(", ") === selectedRoute);

		if (!onSave || onSave?.(iniData, { route: oRoute, expectedOut: oRoute?.expectedBuyAmount, 
			swapFrom, swapTo, amount, destinationAddress, slippage, feeOption, selectedRoute, routes, isStreamingSwap,
			 streamingInterval, streamingNumSwaps })) {
				//close the window
				windowA?.close();
		}

	};

	const handleCancelClick = () => {
		onCancel?.();
		//close the window
		windowA.close();
	}



	return (

		<>
			<div className="swap-toolbar">
				{editMode ? (
					<EditModeButtons>
						<button onClick={handleSaveClick}>Save</button>
						<button onClick={handleCancelClick}>Cancel</button>
					</EditModeButtons>
				) : (
					
						<button className='swap-toolbar-button' onClick={() => handleSwap(swapFrom,
							swapTo,
							amount,
							destinationAddress,
							routes,
							selectedRoute,
							slippage,
							skClient,
							wallets,
							setStatusText,
							setSwapInProgress,
							setShowProgress,
							setProgress,
							setTxnHash,
							setExplorerUrl,
							setTxnStatus,
							setTxnTimer,
							tokens,
							swapInProgress,
							feeOption,
							currentTxnStatus,
							chainflipBroker,
							isStreamingSwap,
							streamingInterval,
							streamingNumSwaps,
							setReportData,
							iniData,
							license,
							true,
							setRoutes
						)}>
							<div className='swap-toolbar-icon'>🔄</div>
							Execute
						</button>
						)
					}
						{swapFrom && swapFrom.identifier?.toLowerCase().includes('-0x') && !selectedRoute.includes('CHAINFLIP_DCA') && !swapInProgress && !selectedRoute.includes('CHAINFLIP') &&
							<button className='swap-toolbar-button' onClick={() => {
								handleApprove(swapFrom,
									amount,
									skClient,
									wallets,
									setStatusText,
									setSwapInProgress,
									setShowProgress,
									setProgress,
									setExplorerUrl,
									routes,
									selectedRoute,
									chainflipBroker,
									feeOption,
								);
							}}>
								<div className='swap-toolbar-icon'>✅</div>
								Approve
							</button>
						}
						{(selectedRoute.includes('CHAINFLIP_DCA') || selectedRoute.includes('CHAINFLIP')) &&
							<button className='swap-toolbar-button' onClick={() => handleSwap(swapFrom,
								swapTo,
								amount,
								destinationAddress,
								routes,
								selectedRoute,
								slippage,
								skClient,
								wallets,
								setStatusText,
								setSwapInProgress,
								setShowProgress,
								setProgress,
								setTxnHash,
								setExplorerUrl,
								setTxnStatus,
								setTxnTimer,
								tokens,
								swapInProgress,
								feeOption,
								currentTxnStatus,
								chainflipBroker,
								isStreamingSwap,
								streamingInterval,
								streamingNumSwaps,
								setReportData,
								iniData,
								license,
								false,
								setRoutes
							)}>
								<div className='swap-toolbar-icon'>📂</div>
								Open Channel
							</button>

						}
						<button className='swap-toolbar-button' onClick={() => {
							setSwapInProgress(false);
							setTxnHash([]);
							setTxnStatus('');
							setStatusText("");
							doGetQuotes(true);
						}}>
							<div className='swap-toolbar-icon'>❝</div>
							Quote
						</button>
						<button className='swap-toolbar-button' onClick={() => {
							const swapX = swapFrom;
							setManualStreamingSet(false);
							setSwapFrom(swapTo);
							setSwapTo(swapX);
						}}>
							<div className='swap-toolbar-icon' >⇋</div>
							Switch
						</button>

						{swapTo && swapFrom &&
							<button
								className='swap-toolbar-button'
								onClick={() => setShowOutputInputDialog(true)}
								disabled={swapInProgress}
							>
								<div className='swap-toolbar-icon'>🎯</div>
								Target
							</button>

						}


						{explorerUrls.length > 0 &&
							explorerUrls.map((explorerUrl, index) => (
								<button className='swap-toolbar-button' onClick={() => {
									window.open(explorerUrl, '_blank');
								}}>
									<div className='swap-toolbar-icon' >⛓</div>
									View TX
								</button>
							))
						}

						{reportData && reportData.ini &&
							<button className='swap-toolbar-button' onClick={() => {
								generateSwapReport(reportData, onOpenWindow);
							}}>
								<div className='swap-toolbar-icon' >📋</div>
								Log
							</button>
						}
			</div>

			{(statusText && statusText !== '') &&
				<div className='status-text'>
					{statusText}
				</div>
			}
			{showOutputInputDialog && renderOutputInputDialog()}

			<div style={{ width: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }} className={'swap-component ' + (swapInProgress ? 'swap-in-progress' : '')}>

				<div style={{ display: (swapInProgress || explorerUrls.length ? 'flex' : 'none') }} className="swap-progress-container">
					{swapInProgress ? <div>
						<div className="swap-progress" onClick={() => {
							setTxnStatus((prev) => {
								if (prev?.done === true) return prev;
								if (prev?.done === false) return prev;
								if (prev === null) return prev;
								prev.lastCheckTime = 10; return prev;
							})
						}} >
							{showProgress && <ProgressBar percent={progress} progressID={windowId} showPopup={true} />}
						</div>
					</div>
						: ''}


				</div>



				<div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '10px' }}>

					<div className="field-group token-select-group">
						<div className='token-select'>

							<button onClick={() => !swapInProgress && openTokenDialog(setSwapFrom, 'from')} className='select-button' style={{ minWidth: '130px', minHeight: '75px' }}>
								{swapFrom ? (
									<span className='token'>
										<img src={swapFrom.logoURI} alt={swapFrom.name} style={{ width: '20px', height: '20px', 'marginRight': '5px', marginLeft: '5px' }} />
										<span> <b>{swapFrom.ticker}</b> {swapFrom.name} on {swapFrom.chain} {(swapFrom?.ticker?.includes('/') ? ' (Synthetic)' : '')}
										</span>
									</span>
								) :
									<span className='token'>

										<div className='swap-toolbar-icon' >🔍</div> <b>From...</b>
									</span>
								}
							</button>

						</div>
						<div className='token-select'>

							<button onClick={() => !swapInProgress && openTokenDialog(setSwapTo, 'to')} className='select-button' style={{ minWidth: '130px', minHeight: '75px' }}>
								{swapTo ? (
									<span className='token'>
										<img src={swapTo.logoURI} alt={swapTo.name} style={{ width: '20px', height: '20px', 'marginRight': '5px', marginLeft: '5px' }} />
										<span> <b>{swapTo.ticker}</b> {swapTo.name} on {swapTo.chain} {(swapTo?.ticker?.includes('/') ? ' (Synthetic)' : '')}
										</span>
									</span>
								) : <span className='token'>

									<div className='swap-toolbar-icon' >🔍</div> <b>To...</b>
								</span>
								}
							</button>
						</div>
					</div>

					<div className="field-group amt-box" style={{ marginBottom: 0, paddingLeft: '3px' }}>
						<div><label>Amount
							{swapFrom && (
								<div style={{ fontSize: '0.9em', fontWeight: 500 }}>
									{maxAmount} {swapFrom.ticker} Available
								</div>
							)}

						</label></div><div>
							{!swapInProgress ? (
								<>
									<input type="number" value={amount} onChange={e => setAmount(e.target.value)} />

								</>
							) : (
								amount
							)}</div>
					</div>
					<div className="field-group" style={{ marginTop: 0, paddingTop: 0, flexDirection: 'column' }}>
						{!swapInProgress ? (
							<>
								{maxAmount && <input type="range" min="0" max={maxAmount} value={amount} onChange={e => setAmount(e.target.value)} step={maxAmount / 100} />}
							</>
						) : (
							''
						)}
					</div>
					{!swapInProgress && (
						(!embedMode) ?
							(usersDestinationAddress !== destinationAddress) && (
								<div className="field-group">
									<label style={{ display: 'flex', flexDirection: 'row', justifyContent: 'space-between' }}>
										To: 									<button onClick={() => setDestinationAddress(usersDestinationAddress)} title='Use Wallet Address' style={{ marginLeft: '5px', padding: '6px', fontSize: '10px', display: 'block', border: '1px solid black', minWidth: 'fit-content' }} >
											Self
										</button></label>
									<input type="text" value={destinationAddress} onChange={e => setDestinationAddress(e.target.value)} style={usersDestinationAddress && usersDestinationAddress !== destinationAddress ? { color: 'blue' } : {}} placeholder='Enter Destination Address' />

								</div>
							) :

							<div className='infobox tofrom'>
								<div><span><button onClick={() => copyToClipboard(swapFromAddress)}> <FaCopy /></button> <button onClick={() => qrToast(swapFromAddress)} ><FaQrcode /></button> Load funds here:</span><span title={swapFromAddress} > <span className="selectable">{swapFromAddress}</span></span></div>
								<div><span><button onClick={() => copyToClipboard(destinationAddress)}><FaCopy /></button> <button onClick={() => qrToast(swapFromAddress)} ><FaQrcode /></button> Destination:</span><span style={{ flex: '0 0 0' }}>  {!swapInProgress && usersDestinationAddress && usersDestinationAddress !== destinationAddress ? (
									<button onClick={() => setDestinationAddress(usersDestinationAddress)} title='Use Wallet Address' style={{ marginLeft: '5px', padding: '6px', fontSize: '10px', display: 'block', border: '1px solid black', minWidth: 'fit-content' }} >
										Self
									</button>

								) : ''}</span><span title={destinationAddress}> <span onClick={() => setDestinationAddress('')}>
									{(!swapInProgress && (usersDestinationAddress !== destinationAddress)) ?
										<input type="text" value={destinationAddress} onChange={e => setDestinationAddress(e.target.value)} style={usersDestinationAddress && usersDestinationAddress !== destinationAddress ? { color: 'blue' } : {}} placeholder='Enter Destination Address' />
										:
										destinationAddress
									}

								</span> </span> </div>
							</div>
					)}

					{isStreamingSwap && (
						<>
							<div className="field-group streaming-group">
								<label>Streaming</label>
								<div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
									<div>
										<span>Block Interval (~6s):</span><input type="number" value={streamingInterval} onChange={e => setStreamingInterval(e.target.value)} disabled={swapInProgress} /></div>
									<div><span>Number of swaps:</span><input type="number" value={streamingNumSwaps} disabled={swapInProgress}
										//max 20
										onChange={e => {
											setStreamingNumSwaps(e.target.value);
											setManualStreamingSet(true);
										}
										}
									/></div>
									<div><span>Max Slippage %</span><input type="number" value={slippage} onChange={e => {
										setSlippage(e.target.value)
										setManualStreamingSet(true);
									}}
										disabled={swapInProgress} /></div>
								</div>
							</div>
							<div className="infobox">

								{streamingNumSwaps * streamingInterval > 14400 ?
									<div><span>Warning:</span><span>Maximum Time Exceeded, Swap will fail.</span> </div> :

									streamingNumSwaps > 0 && <div><span>Swapping Duration Estimate:</span><span>{secsToDisplay(streamingInterval * streamingNumSwaps * 6)}</span></div>
								}
								<div><span>Swaps</span><span>{streamingNumSwaps === 0 ? 'Automatic' : (amount / streamingNumSwaps) + ' ' + swapFrom.ticker + ' per Swap.'}</span> </div>


								<div>
									<span>Information:</span>
									<span>
										<a href="https://docs.mayaprotocol.com/mayachain-dev-docs/introduction/swapping-guide/streaming-swaps" target="_blank">Maya</a> -
										<a href="https://dev.thorchain.org/swap-guide/streaming-swaps.html" target="_blank" >Thorchain</a> -
										<a href="https://docs.chainflip.io/swapping/integrations/swapping-basics#dollar-cost-average-dca-improving-price" target="_blank" >Chainflip</a>
									</span>
								</div>
							</div>
						</>
					)}


					<div className="field-group flex-wrap route-selection-group">
						<label>Route Selection</label>
						{!swapInProgress ? (
							<><div style={{ width: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', justifyContent: 'space-evenly', marginTop: '1px' }}>

								<select onChange={handleRouteSelection} value={selectedRoute}>
									<option value="optimal">Optimal Route</option>
									{routes && routes.map((route, index) => (
										<option key={route.providers.join(', ')} value={route.providers.join(', ')} disabled={route.disabled === true}>
											{route.providers.join(', ')} - {
												(route.disabled === true) ? 'Unavailable' : (route.estimatedTime === null || route.estimatedTime === undefined) ?
													((route.timeEstimates) ? //add up all the values in the timeEstimates object
														Object.values(route.timeEstimates).reduce((a, b) => a + b, 0) / 6000
														: 0)
													:

													parseFloat(parseFloat((typeof (route.estimatedTime) === 'object' ? route.estimatedTime.total / 60 : route.estimatedTime / 60)).toPrecision(1))

											} mins ~{parseFloat(parseFloat(route.expectedOutputMaxSlippage || route.expectedBuyAmount).toPrecision(5))} {swapTo?.ticker}
										</option>
									))}
									{selectedRoute && selectedRoute !== 'optimal' && selectedRoute !== -1 &&
										(!routes || routes.length === 0 || !routes.find(route => route.providers.join(', ') === selectedRoute)) && <option value={selectedRoute} disabled>{selectedRoute} <i>(Unavailable)</i></option>}
								</select></div>

							</>

						) : (
							<span>{selectedRoute}</span>
						)}
					</div>
					{quoteStatus && !swapInProgress &&
						<div className='optimal-route'><div className='infobox'>
							{quoteStatus}
						</div>
						</div>
					}
				</div>
				{showSwapini === false &&
					<button onClick={() => setShowSwapini(true)} style={{ padding: '8px' }}>Advanced...</button>
				}

				<div style={{
					marginLeft: '2px', marginRight: 0, border: '1px solid black', marginBottom: '2px', width: 'calc(100% - 5px)', overflowX: 'hidden',
					display: showSwapini ? 'flex' : 'none'
				}} className='inibox'>
					<TitleBar title="swap.ini" showMinMax={false} isActiveWindow={true}
						onContextMenu={() => {
							setShowSwapini(false)
						}
						}
					/>
					<MenuBar menu={menu} windowId={windowId} onMenuClick={handleMenuClick} />
					<textarea value={iniData}
						onChange={e => delayedParseIniData(e.target.value, setIniData, setSwapFrom, setSwapTo, setAmount, setDestinationAddress, setFeeOption, setSlippage, setSelectedRoute, setRoutes, routes, tokens, setManualStreamingSet, setStreamingInterval, setStreamingNumSwaps)}
						style={{ width: '100%', height: '150px', boxSizing: 'border-box', 'border': 'none' }}
						onFocus={handleTextareaFocus}
						onBlur={handleTextareaBlur}
						id='swap-ini'
						readOnly={swapInProgress}
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
									console.log('File loaded:', ev.target.result);
									setIniData(ev.target.result);
									delayedParseIniData(ev.target.result, setIniData, setSwapFrom, setSwapTo, setAmount, setDestinationAddress, setFeeOption, setSlippage, setSelectedRoute, setRoutes, routes, tokens, setManualStreamingSet, setStreamingInterval, setStreamingNumSwaps);
								};
								reader.readAsText(file);
							}
						}}
					/>
				</div>
				{tokenChooserDialog}
			</div>
		</>
	);
};

export default SwapComponent;

