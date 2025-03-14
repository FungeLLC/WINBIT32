import React, { useEffect, useRef, useState } from 'react';
import styled from 'styled-components';

const MatrixContainer = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;

  background: transparent;
  z-index: 999999;
  display: ${props => props.show ? 'flex' : 'none'};
  flex-direction: column;
`;

const Status = styled.div`
  margin: 0.5em;
  color: #ffa500;
  display:none;
`;

const RainContainer = styled.div`
  position: relative;
  flex: 1;
  overflow: hidden;
  background: transparent;
    width: 100vw;
  height: 100vh;
`;

const MatrixLine = styled.div`
  position: absolute;
  display: flex;
  flex-direction: column;
  opacity: 1;
  z-index: 2;
  transition: opacity 1s ease-out;
  width: auto;
  min-width: 20px;
`;

const MatrixChar = styled.div`
  color: #ffa500;
  font-family: monospace;
  font-size: 18px;
  white-space: pre;
  text-shadow: 0 0 2px #ffa500;
  opacity: 0.8;
  transition: all 0.2s;
  padding: 2px;
  
  &.glow {
    color: #ffd700;
    text-shadow: 0 0 10px #ffd700;
    opacity: 1;
  }
`;

const Matrix = ({ show, onHide }) => {
	const containerRef = useRef();
	const [status, setStatus] = useState('Initialising matrix feed...');
	const [paused, setPaused] = useState(false);
	const blockQueue = useRef([]);
	const isTyping = useRef(false);
	const currentBlockHash = useRef(null);
	const pausedRef = useRef(paused);

	useEffect(() => {
		pausedRef.current = paused;
	}, [paused]);



	const BLOCK_TYPING_DURATION_MS = 60_000;

	useEffect(() => {
		if (!show){
			setPaused(true);
			isTyping.current = false;
			//destroy all the matrix lines
			const lines = containerRef.current?.querySelectorAll('.matrix-line');
			if (lines) {
				lines.forEach(line => containerRef.current.removeChild(line));
			}

			return;
		}
		setPaused(false);

		const fetchNewBlock = async () => {
			try {
				const res = await fetch('https://winbit32.com/api/latestblockhex');
				if (!res.ok) throw new Error(`HTTP ${res.status}`);

				const data = await res.json();
				if (!data.blockHash || !data.blockHex) {
					setStatus('No block data yet...');
					return;
				}

				data.blockHash = data.blockHash.trim() + ':' + data.minuteIndex;

				if (data.blockHash !== currentBlockHash.current &&
					!blockQueue.current.some(b => b.hash === data.blockHash)) {
					blockQueue.current.push({
						hash: data.blockHash,
						hex: data.blockHex
					});
					setStatus(`New block queued: ${data.blockHash}`);


				} else {
					setStatus('No new block found this poll...');
				}
				if (!isTyping.current) {
					typeNextBlock();
				}
			} catch (err) {
				console.error('Error fetching block:', err);
				setStatus(`Error fetching block: ${err.message}`);
			}
		};

		const interval = setInterval(fetchNewBlock, 50_000);
		fetchNewBlock();

		return () => clearInterval(interval);
	}, [show]);

	const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

	const typeChunk = async (chunk, msPerChar) => {
		const lineEl = document.createElement('div');
		lineEl.className = 'matrix-line';
		lineEl.style.position = 'absolute';
		lineEl.style.display = 'flex';
		lineEl.style.flexDirection = 'column';
		lineEl.style.opacity = '1';
		lineEl.style.zIndex = '2';
		lineEl.style.transition = 'opacity 1s ease-out';

		const cWidth = containerRef.current?.clientWidth;
		const cHeight = containerRef.current?.clientHeight;
		const randX = Math.floor(Math.random() * (cWidth - 50));
		const randY = Math.floor(Math.random() * (cHeight - 200));

		lineEl.style.left = randX + 'px';
		lineEl.style.top = randY + 'px';

		containerRef.current?.appendChild(lineEl);

		for (let i = 0; i < chunk.length; i++) {
			const charEl = document.createElement('div');
			Object.assign(charEl.style, MatrixChar);
			charEl.className = 'matrix-char glow';
			charEl.textContent = chunk[i];
			lineEl.appendChild(charEl);

			if (i > 0) {
				const prevChar = lineEl.children[i - 1];
				prevChar.classList.remove('glow');
			}
			await sleep(msPerChar);
			if (pausedRef.current) return;
		}

		if (lineEl.lastChild) {
			lineEl.lastChild.classList.remove('glow');
		}

		if (pausedRef.current) return;

		setTimeout(() => {
			if (!pausedRef.current) {
				lineEl.style.opacity = '0';
			}
		}, 2000);

		setTimeout(() => {
			if (containerRef.current?.contains(lineEl) && !pausedRef.current) {
				containerRef.current.removeChild(lineEl);
			}
		}, 5000);
	};

	const splitIntoRandomChunks = hex => {
		let i = 0;
		const chunks = [];
		while (i < hex.length) {
			const size = Math.floor(Math.random() * 5) + 4;
			const chunk = hex.slice(i, i + size);
			i += size;
			chunks.push(chunk);
		}
		return chunks;
	};

	const typeNextBlock = async () => {
		if (blockQueue.current.length === 0) {
			isTyping.current = false;
			return;
		}
		isTyping.current = true;

		const { hash, hex } = blockQueue.current.shift();
		currentBlockHash.current = hash;
		setStatus(`Typing block: ${hash}`);

		const totalChars = hex.length;
		const msPerChar = BLOCK_TYPING_DURATION_MS / totalChars;
		const chunks = splitIntoRandomChunks(hex);

		for (let i = 0; i < chunks.length; i++) {
			if (pausedRef.current) return;
			await typeChunk(chunks[i], msPerChar);
			await sleep(msPerChar * 2);
		}

		setStatus(`Finished block: ${hash}`);
		if (!pausedRef.current) typeNextBlock();
	};

	useEffect(() => {
		console.log(status);
	}
		, [status]);

	return (
		<MatrixContainer show={show} >
			<Status onClick={() => setPaused(!paused)}>
				{paused ? 'Paused' : 'Running'} -
				{status}</Status>
			<RainContainer ref={containerRef} onClick={onHide} />
		</MatrixContainer>
	);
};

export default Matrix;