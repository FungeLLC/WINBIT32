import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import { saveAs } from 'file-saver';
import { useIsolatedState, useIsolatedRef } from '../win/includes/customHooks';
import Password from "../win/Password";
import DialogBox from '../win/DialogBox';
import '../win/styles/Password.css';
import { wordlist } from '@scure/bip39/wordlists/english';
import { createHash } from "crypto-browserify";
import { createRoot } from 'react-dom';
import { entropyToMnemonic } from '@scure/bip39';

const Paintbrush = ({ onMenuAction, windowA, windowId, handleOpenArray }) => {
	const handleOpenWindow = handleOpenArray[0]; // const handleOpenWindow = (program, metadata, saveState = true) => { ... }; - metadata.phrase for winbit32.exe

	const [canvasUrl, setCanvasUrl] = useIsolatedState(windowId, 'canvasUrl', null);
	const [generatedPhrase, setGeneratedPhrase] = useState(null);

	const canvasRef = useRef(null);
	const contextRef = useRef(null);
	const isDrawingRef = useIsolatedRef(windowId, 'isDrawingRef', false); // Use ref for real-time behavior

	const [selectedColour, setSelectedColour] = useIsolatedState(windowId, 'selectedColour', '#000000'); // Default to black
	const colourPalette = [
		'#000000', '#FF0000', '#00FF00', '#0000FF',
		'#FFFF00', '#FF00FF', '#00FFFF', '#FFFFFF',
		'#800000', '#008000', '#000080', '#808000',
		'#800080', '#008080', '#808080', '#C0C0C0'
	]; // 16-colour palette

	// Menu structure for Open, Save, Copy, and Paste
	const menu = useMemo(() => [
		{
			label: 'File',
			submenu: [
				{ label: 'Open', action: 'open' },
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
		{
			label: 'Tools',
			submenu: [
				{ label: 'Generate Phrase...', action: 'generatePhrase' },
			],
		}
	], []);

	// Notify parent about the menu structure
	useEffect(() => {
		if (onMenuAction) {
			onMenuAction(menu, windowA, handleMenuClick);
		}
	}, [onMenuAction, windowA, menu]);

	useEffect(() => {
		if (canvasUrl) {
			const canvas = canvasRef.current;
			const context = contextRef.current;
			const image = new Image();
			image.onload = () => {
				context.drawImage(image, 0, 0, canvas.width, canvas.height);
			};
			image.src = canvasUrl;
		}
	}, [windowA]);


	const handleMenuClick = (action) => {
		const canvas = canvasRef.current;
		switch (action) {
			case 'exit':
				windowA.close();
				break;
			case 'save':
				canvas.toBlob((blob) => {
					saveAs(blob, 'painting.png');
				});
				break;
			case 'open':
				document.getElementById('fileInput').click();
				break;
			case 'copy':
				canvas.toBlob((blob) => {
					const item = new ClipboardItem({ 'image/png': blob });
					navigator.clipboard.write([item]);
				});
				break;
			case 'paste':
				navigator.clipboard.read().then((clipboardItems) => {
					const imageItem = clipboardItems.find((item) =>
						item.types.includes('image/png')
					);
					if (imageItem) {
						imageItem.getType('image/png').then((blob) => {
							const img = new Image();
							img.onload = () => {
								contextRef.current.drawImage(
									img,
									0,
									0,
									canvas.width,
									canvas.height
								);
							};
							img.src = URL.createObjectURL(blob);
						});
					}
				});
				break;
			case 'generatePhrase':
				promptUserForDetails('generatePhrase', true) // Pass true for pinMode
					.then(pin => generatePhraseFromImage(pin))
					.catch(err => console.error(err));
				break;
			default:
				console.log(`Unknown action: ${action}`);
				break;
		}
	};

	const startDrawing = (event) => {
		event.preventDefault(); // Prevent default touch event
		isDrawingRef.current = true; // Update ref immediately
		if (event.type === 'touchstart') {
			const touch = event.touches[0];
			const { clientX, clientY } = touch;
			const { left, top } = canvasRef.current.getBoundingClientRect();
			const offsetX = clientX - left;
			const offsetY = clientY - top;
			contextRef.current.beginPath();
			contextRef.current.moveTo(offsetX, offsetY);
		} else {
			const { offsetX, offsetY } = event; // Direct property access
			contextRef.current.beginPath();
			contextRef.current.moveTo(offsetX, offsetY);
		}
	};

	const draw = (event) => {
		event.preventDefault(); // Prevent default touch event
		if (!isDrawingRef.current) return; // Use ref to check drawing status

		if (event.type === 'touchmove') {
			const touch = event.touches[0];
			const { clientX, clientY } = touch;
			const { left, top } = canvasRef.current.getBoundingClientRect();
			const offsetX = clientX - left;
			const offsetY = clientY - top;
			contextRef.current.lineTo(offsetX, offsetY);
			contextRef.current.stroke();
		} else {
			const { offsetX, offsetY } = event; // Direct property access
			contextRef.current.lineTo(offsetX, offsetY);
			contextRef.current.stroke();
		}
	};

	const stopDrawing = () => {
		isDrawingRef.current = false; // Update ref immediately
		contextRef.current.closePath(); // End the drawing path
		setCanvasUrl(canvasRef.current.toDataURL('image/png'));
	};

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;  // Ensure canvas is present

		const w = window.innerWidth > 400 ? 400 : window.innerWidth;
		const h = window.innerHeight > 400 ? 400 : window.innerHeight;

		canvas.width = w;
		canvas.height = h;

		const context = canvas.getContext('2d');

		if (canvasUrl) {
			const image = new Image();
			image.onload = () => {
				context.drawImage(image, 0, 0, canvas.width, canvas.height);
			};
			image.src = canvasUrl;
		}

		context.strokeStyle = selectedColour;
		context.lineWidth = 2;
		context.lineCap = 'round';
		contextRef.current = context; // Store context reference

		// Set up event listeners
		canvas.addEventListener('mousedown', startDrawing);
		canvas.addEventListener('mousemove', draw);
		canvas.addEventListener('mouseup', stopDrawing);
		canvas.addEventListener('mouseleave', stopDrawing);
		// also for touch events
		canvas.addEventListener('touchstart', startDrawing);
		canvas.addEventListener('touchmove', draw);
		canvas.addEventListener('touchend', stopDrawing);
		canvas.addEventListener('touchcancel', stopDrawing);

		// Clean up event listeners on unmount
		return () => {
			canvas.removeEventListener('mousedown', startDrawing);
			canvas.removeEventListener('mousemove', draw);
			canvas.removeEventListener('mouseup', stopDrawing);
			canvas.removeEventListener('mouseleave', stopDrawing);
			// also for touch events
			canvas.removeEventListener('touchstart', startDrawing);
			canvas.removeEventListener('touchmove', draw);
			canvas.removeEventListener('touchend', stopDrawing);
			canvas.removeEventListener('touchcancel', stopDrawing);
		};
	}, [selectedColour, canvasUrl]);

	const promptUserForDetails = (box = 'save', pinMode = false) => {
		return new Promise((resolve, reject) => {
			const div = document.createElement("div");
			document.body.appendChild(div);
			const root = createRoot(div);

			const handleConfirm = ({ password }) => {
				try {
					root.unmount();
					document.body.removeChild(div);
				} catch (e) {
					console.error(e);
				}
				resolve(password);
			};

			const handleCancel = () => {
				root.unmount();
				document.body.removeChild(div);
				reject(new Error("User cancelled the input"));
			};

			root.render(
				<Password onConfirm={handleConfirm} onCancel={handleCancel} box={box} pinMode={pinMode} />
			);
		});
	};

	const getWordFromColour = (hexColour) => {
		const part1 = parseInt(hexColour.slice(1, 4), 16) % 2048;
		const part2 = parseInt(hexColour.slice(4, 7), 16) % 2048;
		return [wordlist[part1], wordlist[part2]];
	};

	const generatePhraseFromImage = (pin) => {
		const canvas = canvasRef.current;
		const context = contextRef.current;
		const words = [];
		const pinDigits = pin.split('').map(digit => parseInt(digit, 10));
		let factor = 0;

		for (let i = 0; i < pinDigits.length; i++) {
			factor += pinDigits[i];
		}

		for (let ii = 0; ii < 6; ii++) { // Use 6 positions, which results in 12 words
			const position = ((factor * (ii + 1)) % (canvas.width * canvas.height)) + (ii * canvas.width);
			const x = position % canvas.width;
			const y = Math.floor(position / canvas.width);
			const imageData = context.getImageData(x, y, 1, 1).data;
			const hexColour = rgbToHex(imageData[0], imageData[1], imageData[2]);
			const [word1, word2] = getWordFromColour(hexColour);
			console.log('Colour:', hexColour, 'Words:', word1, word2, "Position:", position, "X:", x, "Y:", y);	
			words.push(word1, word2);
		}



		const entropy = words.slice(0, 11).map(word => wordlist.indexOf(word).toString(2).padStart(11, '0')).join('');
		const entropyBytes = Buffer.from(entropy.match(/.{1,8}/g).map(byte => parseInt(byte, 2)));
		const phrase = entropyToMnemonic(entropyBytes, wordlist);

		// const phraseWithoutChecksum = words.slice(0, 11).join(' ');
		// console.log('Phrase without checksum:', phraseWithoutChecksum);
		// const checksumWord = calculateChecksum(phraseWithoutChecksum);
		// words[11] = checksumWord;

		// const phrase = words.join(' ');
		console.log('Generated Phrase:', phrase);

		setGeneratedPhrase(phrase);
	};

	const rgbToHex = (r, g, b) => {
		return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase();
	};

	const calculateChecksum = (phraseWithoutChecksum) => {
		const words = phraseWithoutChecksum.split(' ');
		const bits = words.map(word => wordlist.indexOf(word).toString(2).padStart(11, '0')).join('');
		const entropyBits = bits.slice(0, -11);
		const entropyBytes = Buffer.from(entropyBits.match(/.{1,8}/g).map(byte => parseInt(byte, 2)));
		const hash = createHash('sha256').update(entropyBytes).digest();
		const hashBits = hash.toString('binary').split('').map(char => char.charCodeAt(0).toString(2).padStart(8, '0')).join('');
		const checksumBits = hashBits.slice(0, 11);
		const checksumIndex = parseInt(checksumBits, 2);
		return wordlist[checksumIndex];
	};

	const openWinbit = (phrase) => {
		handleOpenWindow('winbit32.exe', { phrase });
	};

	return (
		<div className="paintbrush">
			<canvas ref={canvasRef} style={{ border: '1px solid black' }} />
			<div className="palette">
				{colourPalette.map((colour, index) => (
					<button
						key={index}
						style={{ background: colour, width: '25px', height: '20px', border: 'none' }}
						onClick={() => setSelectedColour(colour)} // Colour change
					/>
				))}
			</div>
			<input
				type="file"
				id="fileInput"
				style={{ display: 'none' }} // Hidden file input for Open
				onChange={(e) => {
					const file = e.target.files[0];
					if (file) {
						const img = new Image();
						img.onload = () => {
							contextRef.current.drawImage(
								img,
								0,
								0,
								canvasRef.current.width,
								canvasRef.current.height
							);
						}
						img.src = URL.createObjectURL(file);
					}
				}}
			/>

			{generatedPhrase && (
				<DialogBox
					title="Generated Phrase"
					content={
						<div className="dialog-content" style={{marginLeft: '2vw'}} >
							<div className="dialog-field">
								<textarea value={generatedPhrase} readOnly style={{ width: '100%', height: '100px', textAlign: 'justify' }} />
							</div>
							<div>Images can change due to compression etc. Always keep a backup of the phrase as text or a key.</div>
							<div style={{ display: 'flex', justifyContent: 'center' }}>
								<button className='swap-toolbar-button' onClick={() => {
									openWinbit(generatedPhrase)
								}}>
									<div className='swap-toolbar-icon'>💰</div>
									Money Manager
								</button>
								{/* title: "Security Tools",
								icon: "🔒",
								progName: "sectools.exe", */}
								<button className='swap-toolbar-button' onClick={() => {
									handleOpenWindow('sectools.exe', { phrase: generatedPhrase });
								}}>
									<div className='swap-toolbar-icon'>🔒</div>
									Security Tools
								</button>
							</div>

						</div>
					}
					buttons={[
						{ label: 'OK', onClick: () => setGeneratedPhrase(null) }
					]}
					onConfirm={() => setGeneratedPhrase(null)}
					onCancel={() => setGeneratedPhrase(null)}
				/>
			)}
		</div>
	);
};

export default Paintbrush;
