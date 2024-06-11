import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import './styles/Calculator.css';
import { evaluate } from 'mathjs';
import { useIsolatedState, useIsolatedRef, useArrayState } from '../win/includes/customHooks';
import WindowContainer from '../win/WindowContainer';
import ConnectionApp from './ConnectionApp';
import { generateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';
import { saveAs } from 'file-saver';
import { useWindowSKClient } from '../contexts/SKClientProviderManager';
import { Chain } from '@swapkit/sdk';
import { QRCodeSVG } from 'qrcode.react';
import { renderToString, renderToStaticMarkup } from 'react-dom/server'
import { isValidMnemonic } from '../helpers/phrase';
import { set } from 'lodash';

// Function to generate a random phrase
function generatePhrase(size = 12) {
	const entropy = size === 12 ? 128 : 256;
	return generateMnemonic(wordlist, entropy);
}


const Winbit32 = ({ onMenuAction, windowA, windowId, windowName, setStateAndSave, handleStateChange, providerKey }) => {

	const [phrase, setPhrase] = useIsolatedState(windowId, 'phrase', generatePhrase());
	//const [phrase, setPhrase] = useIsolatedState(windowId, 'phrase', generatePhrase());
	const [connectionStatus, setConnectionStatus] = useIsolatedState(windowId, 'connectionStatus', 'disconnected');
	// 'disconnected', 'connecting', 'connected'
	const [statusMessage, setStatusMessage] = useIsolatedState(windowId, 'statusMessage', 'Save this phrase, or paste your own to connect.');

	const [phraseSaved, setPhraseSaved] = useIsolatedState(windowId, 'phraseSaved', false);

	const [showProgress, setShowProgress] = useIsolatedState(windowId, 'showProgress', false);
	const [progress, setProgress] = useIsolatedState(windowId, 'progress', 0);

	const { skClient, setWallets, connectChains, disconnect } = useWindowSKClient(windowName);

	

	const currentRef = useRef(phrase);

	currentRef.current = phrase; // Update `useRef` when `input` changes

	useEffect(() => {
		currentRef.current = phrase; // Update `useRef` when `input` changes
	}, [phrase]);

	// Define the calculator menu with Copy and Paste functionality
	const menu = useMemo(() => [
		{
			label: 'File',
			submenu: [
				{ label: 'Open...', action: 'open' },
				{ label: 'Save', action: 'save' },
				{ label: 'Exit', action: 'exit' },
			],
		},
		{
			label: 'Edit',
			submenu: [
				{ label: 'Copy', action: 'copy' },
				{ label: 'Paste', action: 'paste' },
			],
		},
	], []);

	// Handle menu actions (Copy/Paste)
	const handleMenuClick = useCallback((action) => {
		const currentInput = currentRef.current; // Get the current input from `useRef`

		switch (action) {
			case 'exit':
				windowA.close();
				break;
			case 'open':
				document.getElementById('fileInput' + windowId).click(); // Trigger file input
				break;
			case 'save':
				const blob = new Blob([currentInput], { type: 'text/plain' });
				saveAs(blob, 'phrase.txt'); // Save file
				setPhraseSaved(true);
				break;
			case 'copy':
				console.log('Copying:', currentInput);
				navigator.clipboard.writeText(currentInput); // Copy current input to clipboard
				setPhraseSaved(true);
				break;
			case 'paste':
				navigator.clipboard.readText().then((clipboardText) => {
					setPhrase(clipboardText.replace(/[^a-zA-Z ]/g, '').replace(/  +/g, ' ')); // Set input with clipboard text
					//wait a second then handleConnect
					setTimeout(() => {
						handleConnect();
					}, 1500);

				});
				break;
			default:
				console.log(`Unknown action: ${action}`);
				break;
		}
	}, []);


	// Notify parent about the menu structure and click handler
	useEffect(() => {
		if (onMenuAction) {
			onMenuAction(menu, windowA, handleMenuClick); // Pass menu and click handler
		}
	}, [onMenuAction, menu, windowA, handleMenuClick]);

	const appendInput = (value) => {
		setPhrase((prevInput) => prevInput + value); // Append the value to the input
	};



	const currentPhraseRef = useIsolatedRef(windowId, 'phrase', '');

	currentPhraseRef.current = phrase;

	useEffect(() => {
		currentPhraseRef.current = phrase.replace(/[^a-zA-Z ]/g, '').replace(/  +/g, ' ').trim();
	}, [phrase]);

	const checkValidPhrase = async () => {
		//CHECK phrase - test each word
		const words = currentPhraseRef.current.split(' ');
		if (words.length !== 12) {
			console.log('Phrase must be 12 words');
			return false;
		}
		//do a proper check on the phase with bip39 library
		const isValid = words.every(word => wordlist.indexOf(word) >= 0);
		if (!isValid) {
			console.log('Invalid phrase');
			return false;
		}
	
		const isValidPhase = isValidMnemonic(currentPhraseRef.current);
		console.log('isValidPhase', isValidPhase);
		if (!isValidPhase) {
			console.log('Invalid checksum ', currentPhraseRef.current);
			return false;
		}
		return true;
	};
	

	const checkHandleConnect = async (chkPhrase) => {
		const valid = await checkValidPhrase();
		console.log('checkHandleConnect', valid);
		if (currentPhraseRef.current === chkPhrase)	{
			if (valid  === true ) {
				console.log('Valid phrase');
				handleConnect();
			} else {
				console.log('Invalid phrase');
				setConnectionStatus('disconnected');
				setStatusMessage('Invalid phrase');
				disconnect();
				setShowProgress(false);
			}
		}
	};

	useEffect(() => {
		//set a delayed check on checkHandleConnect
		if (connectionStatus !== 'connecting') {
			const to = setTimeout(() => {
				checkHandleConnect(
					currentPhraseRef.current + '' //force a string
				);
			}, 1000);
			return () => clearTimeout(to);
		}
		setPhraseSaved(false);
	}, [phrase]);




	const handleConnect = async () => {
		setConnectionStatus('connecting');
		setStatusMessage('Connecting...');
		setShowProgress(true);
		setProgress(13); // Initial progress set to 13% to simulate starting connection

		const phrase = currentPhraseRef.current;
		console.log('Connecting with phrase:', phrase.trim());
		console.log('connecting with skClient:', skClient);
		try {
			// Simulate connecting with a phrase (you can add real connection logic here)
			skClient.connectKeystore(connectChains, phrase)
				.then(async (wallet) => {
					console.log('Connected successfully', wallet);
					setProgress(98);

					skClient.getWalletByChain(Chain.Ethereum).then(async (result) => {
						setProgress(99);

						const wallets = await Promise.all(connectChains.map(skClient.getWalletByChain));

						//add a qr image to each wallet
						wallets.forEach((wallet, index) => {
							wallet.qrimage = renderToStaticMarkup(<QRCodeSVG renderAs='svg' value={wallet.address} />).toString();
							wallet.chain = connectChains[index].toString();
						});

						if (currentRef.current !== phrase) {
							console.log('Phrase changed, not updating wallets', phrase, currentRef.current);
							return;
						}

						setWallets(wallets);
						setProgress(100);


						console.log('Connected successfully', wallets);
						console.log('Connected successfully', wallets[0].balance[0]);


						setPhraseSaved(false);
						setConnectionStatus('connected');
						setStatusMessage('Connected successfully.');
						setTimeout(() => {
							setShowProgress(false);
							setProgress(0);
						}, 2000);
					});
				})
				.catch((error) => {
					console.error('Connection failed', error);
					setConnectionStatus('disconnected');
					setStatusMessage(`Connection failed: ${error.message}`);

				}).finally(() => {

				})
				;

		} catch (error) {
			console.error('Connection failed', error);
			setConnectionStatus('disconnected');
			setStatusMessage(`Connection failed: ${error.message}`);
		}
	};

	return (
		<WindowContainer
			key={windowName + '_container_' + windowId}
			controlComponent={windowA.controlComponent}
			subPrograms={windowA.programs}
			windowName={windowA.progName.replace('.exe', '') + '-' + windowId}
			initialSubWindows={windowA.programs}
			onWindowDataChange={newData => handleStateChange(windowA.id, newData)}
			windowId={windowId}
			setStateAndSave={setStateAndSave}
			providerKey={windowName}
		>
			<ConnectionApp windowId={windowId} providerKey={windowName} phrase={phrase} setPhrase={setPhrase}
				connectionStatus={connectionStatus}
				setConnectionStatus={setConnectionStatus}
				statusMessage={statusMessage}
				setStatusMessage={setStatusMessage}
				showProgress={showProgress}
				setShowProgress={setShowProgress}
				progress={progress}
				setProgress={setProgress}
				phraseSaved={phraseSaved}
				setPhraseSaved={setPhraseSaved}
			/>
			<input
				type="file"
				id={"fileInput" + windowId}
				style={{ display: 'none' }} // Hidden file input for Open
				onChange={(e) => {
					const file = e.target.files[0];
					if (file) {
						const reader = new FileReader();
						reader.onload = (ev) => setPhrase(ev.target.result);
						reader.readAsText(file);
					}
				}}
			/>
		</WindowContainer>
	);
};

export default Winbit32;
