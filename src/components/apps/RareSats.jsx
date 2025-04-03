import React, { useState, useEffect, useRef } from 'react';
import styled from 'styled-components';


// Layout constants
const LAYOUT_CONSTANTS = {
	TILE_SPACING: 10,
	EDGE_PADDING: 10,
	MAX_TILES_PER_ROW: 5,
	MIN_TILE_SIZE: 100,
	MAX_TILE_SIZE: 120,
	MIN_CONTAINER_SIZE: 300,
};

const TILES_PER_LEVEL = 18; // 5+4+5+4 pattern
const VISIBLE_LEVELS = 4;
const BUFFER_LEVELS = 2;
const BASE_URL = 'https://api-mainnet.magiceden.io/v2/ord/btc/raresats';
const SPONSOR_WALLET = 'bc1p88gpg7xjv9fvh28wnklesjs3wpj6mhp2ulnrtyc4hkxtwhqly7uqyhmtka';
const fetch = require("fetch-retry")(global.fetch);
const headers = {
	'Content-type': 'application/json',
	'Authorization': 'Bearer 92c62b16-f5ac-4ad9-849a-a30a9770a4b6',
	'Accept': 'application/json',
	'Origin': 'https://magiceden.io'
};

/** Faux 3D styling constants:
 *  - The face will be `tile.width × tile.height`.
 *  - We'll add a small left edge (width) + bottom edge (height) to the container.
 *  - We'll slightly skew the edges to mimic the old-school 2D mahjong look.
 */
const TILE_SIDE_WIDTH = 10;
const TILE_SIDE_HEIGHT = 10;
const LEFT_SKEW_DEG = -45;
const BOTTOM_SKEW_DEG = 45;

// ================ Styled Components ================

const GameContainer = styled.div`
	width: 100%;
	height: 100%;
	background: #008000;
	overflow: hidden;
	position: relative;
	perspective: 1000px;
	/* Added perspective to make the 3D effect more pronounced */
	transform-style:
	preserve-3d;
	/* removed perspective since we don't want true 3D */
`;

const TileStack = styled.div`
	position: relative;
	width: 100%;
	height: 100%;
	/* No rotateX, just a normal container now */
`;

// Layer styling with correct z-index and transforms
const Layer = styled.div`
  position: absolute;
  width: 100%;
  height: 100%;
  will-change: transform, opacity;
  transition: transform 0.6s ease, opacity 0.6s ease;
  transform-style: preserve-3d;
  z-index: ${props => 1000 - props.index};
  pointer-events: ${props => (props.index === 0 ? 'auto' : 'none')};

  transform: ${props => {
    if (props.isExiting) {
      // Exit animations
      return props.exitDirection === 'down'
        ? 'translateY(-150px)'
        : 'translateY(150px)';
    }
    if (props.isEntering) {
      // Enter animations - opposite of exit
      return props.exitDirection === 'down'
        ? 'translateY(100px)'
        : 'translateY(0px)';
    }
    // Normal position
    return `translateY(${props.index * -20}px))`;
  }};
  
  opacity: ${props => {
    if (props.isExiting || props.isEntering) return 0;
    return 1;
  }};
`;

// Tile wrapper with correct pointer events
const TileWrapper = styled.div`
  position: absolute;
  width: ${props => props.faceWidth + TILE_SIDE_WIDTH}px;
  height: ${props => props.faceHeight + TILE_SIDE_HEIGHT}px;
  left: ${props => props.x}px;
  top: ${props => props.y}px;
  cursor: pointer;
  pointer-events: auto;
`;


/** 
 * The “Faux3DTileContainer” houses the tile face and 2 edges.
 * We'll place them such that the face is top-left, 
 * left edge is skewed, bottom edge is skewed, 
 * giving that classic mahjong effect.
 */
const Faux3DTileContainer = styled.div`
  position: sticky;
  top: 0;
  left: 0;
  z-index: 2;
  /* Give a slight fake perspective by offsetting each lower layer. 
     Pass a prop like layerIndex to adjust. */
  transform: ${props => `translate(${props.layerIndex * -15}px, ${props.layerIndex * 15}px)`};
`;

/** The tile face (top surface). */
const TileFace = styled.div`
	position: absolute;
	width: ${props => props.faceWidth}px;
	height: ${props => props.faceHeight}px;
	background: ${props => props.topColor || '#eee'};
	border: 1px solid #888;
	z-index: 3; /* Ensure face is on top */
`;

/** Slight overlay text (e.g. price, range). */
const Price = styled.div`
	position: absolute;
	top: 2px;
	left: 2px;
	font-size: 12px;
	background-color: rgba(255, 255, 255, 0.8);
	padding: 1px 4px;
	border-radius: 3px;
	color: #000;
	font-weight: bold;
`;

const RangeCount = styled.div`
	position: absolute;
	top: 2px;
	right: 2px;
	font-size: 12px;
	background-color: rgba(255, 255, 255, 0.8);
	padding: 1px 4px;
	border-radius: 3px;
	color: #000;
	font-weight: bold;
`;

/** Three lines of the sat number, in an oriental font, fill available space */
const SatNumberOriental = styled.div`
	display: flex;
	flex-direction: column;
	align-items: center;
	font-family: 'Papyrus', 'MingLiU', fantasy;
	writing-mode: vertical-lr;
	text-orientation: upright;
	font-size: ${props => Math.max(10, Math.floor(props.faceSize / 7))}px;
	font-weight: bold;
	flex-grow: 1;
	justify-content: space-between;
	color: #000;
	text-align: center;
	overflow: hidden;
	white-space: nowrap;
	margin: auto;
    padding-top: 20px;
	width:100%;

	/* Ensure the text doesn't overflow the tile */
	/* This is a bit hacky, but it works for this case */
	& > div {
		overflow: hidden;
		text-overflow: ellipsis;
	}

`;

const Sattributes = styled.div`
	margin-top: auto;
	font-size: 11px;
	color: #000;
	text-align: center;
`;

/** The left edge - a narrow, vertically skewed strip. */
const TileLeft = styled.div`
	position: absolute;
	top: 0;
	left: -${TILE_SIDE_WIDTH}px;
	width: ${TILE_SIDE_WIDTH}px;
	height: ${props => props.faceHeight}px;
	background: ${props => props.sideColor || '#ddd'};
	border: 1px solid #000;
	transform-origin: top right;
	transform: skewY(${LEFT_SKEW_DEG}deg);
	z-index: 2; /* behind the face */
`;

/** The bottom edge - a narrow, horizontally skewed strip. */
const TileBottom = styled.div`
	position: absolute;
	top: ${props => props.faceHeight}px;
	left: 0;
	width: ${props => props.faceWidth}px;
	height: ${TILE_SIDE_HEIGHT}px;
	background: ${props => props.sideColor || '#ccc'};
	border: 1px solid #000;
	transform-origin: top left;
	transform: skewX(-${BOTTOM_SKEW_DEG}deg);
	z-index: 1; /* behind the left edge */
`;

const LoadingOverlay = styled.div`
	position: absolute;
	top: 0;
	left: 0;
	width: 100%;
	height: 100%;
	background: #008000;
	display: flex;
	flex-direction: column;
	justify-content: center;
	align-items: center;
	opacity: ${props => (props.fading ? 0 : 1)};
	transition: opacity 1s;
	z-index: 1000;
`;

const Title = styled.h1`
	font-family: 'Papyrus', 'MingLiU', fantasy;
	font-size: 72px;
	color: #ffd700;
	text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.5);
	margin: 0;
`;

const LoadingText = styled.div`
	font-family: 'MS Sans Serif', Arial, sans-serif;
	color: #fff;
	font-size: 24px;
	margin-top: 20px;
`;

// Add new styled components
const ScrollIndicator = styled.div`
  position: absolute;
  right: 20px;
  top:10px;
  padding: 10px;
  background: rgba(0,0,0,0.5);
  color: white;
  border-radius: 5px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  z-index: 1000;
`;

const Arrow = styled.div`
  position: relative;
  width: 0; 
  height: 0;
  border-left: 10px solid transparent;
  border-right: 10px solid transparent;
  border-${props => props.direction}: 10px solid #fff;
  opacity: ${props => (props.isActive ? 1 : 0.3)};
  cursor: pointer;
  z-index: 9999;
  pointer-events: auto;
`;

const LevelCounter = styled.div`
  font-family: 'MS Sans Serif', Arial, sans-serif;
  font-size: 14px;
`;

// =============== Utilities / Logic ===============

const useDebounce = (callback, delay) => {
	const timeoutRef = useRef(null);
	return (...args) => {
		if (timeoutRef.current) {
			clearTimeout(timeoutRef.current);
		}
		timeoutRef.current = setTimeout(() => callback(...args), delay);
	};
};

/** Generate color based on sat number - earlier sats are brighter (90% -> 30%) */
const getSatColor = (sat) => {
	const MAX_SATS = 2100000000000000;
	const lightness = 90 - (sat / MAX_SATS) * 60;
	return `hsl(28, 100%, ${lightness}%)`;
};

/** Generate color based on block position - lower positions are brighter (70% -> 20%) */
const getBlockColor = (blockPosition) => {
	const BLOCK_SIZE = 100000000;
	const lightness = 70 - (blockPosition / BLOCK_SIZE) * 50;
	return `hsl(28, 100%, ${lightness}%)`;
};

/** Split the sat number string into roughly 3 lines. */
const splitSatNumberIntoThree = (sat) => {
	const s = String(sat);
	const len = s.length;
	if (len <= 3) {
		// Just put each digit on its own line if short
		return s.split('');
	}
	const chunkSize = Math.ceil(len / 3);
	const lines = [];
	for (let i = 0; i < len; i += chunkSize) {
		lines.push(s.substring(i, i + chunkSize));
	}
	return lines;
};

const splitSatNumberIntoFour = (sat) => {
	const s = String(sat);
	const len = s.length;
	if (len <= 3) {
		// Just put each digit on its own line if short
		return s.split('');
	}
	const chunkSize = Math.ceil(len / 4);
	const lines = [];
	for (let i = 0; i < len; i += chunkSize) {
		lines.push(s.substring(i, i + chunkSize));
	}
	return lines;
};



/** Minimal processing for compressed or raw listing data. */
const processListings = (listings) => {
	if (!Array.isArray(listings)) return [];
	return listings
		.map((item) => {
			// Compressed
			if (item.s) {
				return {
					sat: parseInt(item.s),
					price: item.p / 100000000,
					blockPosition: item.b || 0,
					txid: item.t,
					sattributes: item.sattributes || [],
					rangeCount: 1,
				};
			}
			// Full
			if (!item?.rareSatsUtxo?.satRanges?.[0]) return null;
			const satRanges = item.rareSatsUtxo.satRanges;
			const lowestSatRange = satRanges.reduce((prev, curr) =>
				parseInt(curr.from) < parseInt(prev.from) ? curr : prev
			);
			const totalRareSats = satRanges.reduce(
				(acc, sr) => acc + parseInt(sr.amount || 0),
				0
			);

			return {
				sat: parseInt(lowestSatRange.from),
				price: item.listedPrice / 100000000,
				blockPosition: lowestSatRange.sequence || 0,
				txid: item.rareSatsUtxo.txId,
				sattributes: lowestSatRange.satributes || [],
				rangeCount: totalRareSats,
			};
		})
		.filter(Boolean)
		.sort((a, b) => a.sat - b.sat);
};

/** Simple caching logic. */
const MAX_CACHE_ENTRIES = 10;

const getCacheTimeout = (offset) => {
  if (offset === 0) return 2 * 60 * 1000; // 2 mins for first page
  if (offset < 300) return 5 * 60 * 1000; // 5 mins for early pages
  return 15 * 60 * 1000; // 15 mins for later pages
};

const fetchPage = async (offset = 0, accumulator = [], isSponsored = false) => {
  const cacheKey = `rareSatsListings${isSponsored ? 'Sponsor' : ''}${offset}`;
  
  try {
    // Check cache
    const cachedData = localStorage.getItem(cacheKey);
    const cachedTime = parseInt(localStorage.getItem(cacheKey + 'Time') || '0');
    const cacheAge = Date.now() - cachedTime;
    const cacheTimeout = getCacheTimeout(offset);

    if (cachedData && cacheAge < cacheTimeout) {
      console.log('Cache hit:', cacheKey);
      const parsed = JSON.parse(cachedData);
      accumulator.push(...parsed.tokens);
      
      if (parsed.tokens.length === 100) {
        return fetchPage(offset + 100, accumulator, isSponsored);
      }
      return accumulator;
    }

    // Cache miss or expired - fetch fresh data
    console.log('Cache miss:', cacheKey);



    const endpoint = isSponsored ? `${BASE_URL}/wallet/utxos` : `${BASE_URL}/utxos`;
    const params = isSponsored
      ? { walletAddress: SPONSOR_WALLET, limit: 100, offset }
      : {
          sortBy: 'listedAtDesc',
          limit: 100,
          offset,
          attributes: '{"satributes":["Block 9 450x","Block 9"]}',
          disablePendingTransactions: true,
        };

	 const URLparams = new URLSearchParams();
	 Object.entries(params).forEach(([key, value]) => {
		URLparams.append(key, value);
	 });


    // const result = await axios.get(endpoint, { headers, params });
	  const response = await fetch(endpoint + '?' + URLparams.toString(), {
		  method: "GET",
		  headers: headers,
		  mode: 'cors',
		  retries: 2,
		  retryDelay: function (attempt, error, response) {
			  const delay = Math.pow(2, attempt) * 2000; // 1000, 2000, 4000
			  console.log(`Retrying in ${delay}ms`, error, response);
			  return delay;
		  },
		  retryOn: [504],
	  });
	const result = await response.json();
	console.log('result', result);
    const tokens = result.tokens || [];
    const compressedData = { tokens: tokens.map(compressListing) };

    // Update cache
    cleanupCache();
    localStorage.setItem(cacheKey, JSON.stringify(compressedData));
    localStorage.setItem(cacheKey + 'Time', Date.now().toString());

    accumulator.push(...compressedData.tokens);
    if (tokens.length === 100) {
      return fetchPage(offset + 100, accumulator, isSponsored);
    }
    return accumulator;

  } catch (error) {
    console.error('Error fetching/caching page:', error);
    return accumulator;
  }
};

const cleanupCache = () => {
  try {
    const keys = Object.keys(localStorage)
      .filter(key => key.startsWith('rareSatsListings'))
      .sort((a, b) => {
        const timeA = parseInt(localStorage.getItem(a + 'Time')) || 0;
        const timeB = parseInt(localStorage.getItem(b + 'Time')) || 0;
        return timeA - timeB;
      });

    while (keys.length > MAX_CACHE_ENTRIES) {
      const k = keys.shift();
      localStorage.removeItem(k);
      localStorage.removeItem(k + 'Time');
    }
  } catch (error) {
    console.warn('Cache cleanup failed:', error);
  }
};

/** Make sure we preserve sattributes in compressed form as well. */
const compressListing = (listing) => ({
	s: listing.rareSatsUtxo.satRanges[0].from,
	p: listing.listedPrice,
	t: listing.rareSatsUtxo.txId,
	b: listing.rareSatsUtxo.satRanges[0].sequence,
	sattributes: listing.rareSatsUtxo.satRanges[0].satributes || [],
});

/** Fetch all listings (sponsor & normal) with optional pagination. */
const fetchAllListings = async () => {
	const fetchPage = async (offset = 0, accumulator = [], isSponsored = false) => {
		const cacheKey = `rareSatsListings${isSponsored ? 'Sponsor' : ''}${offset}`;
		const cachedData = localStorage.getItem(cacheKey);
		const cachedTimestamp = localStorage.getItem(cacheKey + 'Time');

		const stillValid =
			cachedTimestamp &&
			Date.now() - parseInt(cachedTimestamp) < getCacheTimeout(offset);

		if (cachedData && stillValid) {
			const parsed = JSON.parse(cachedData);
			accumulator.push(...parsed.tokens);
			if (parsed.tokens.length === 100) {
				return fetchPage(offset + 100, accumulator, isSponsored);
			}
			return accumulator;
		}
		try {
			const endpoint = isSponsored
				? `${BASE_URL}/wallet/utxos`
				: `${BASE_URL}/utxos`;
			const params = isSponsored
				? { walletAddress: SPONSOR_WALLET, limit: 100, offset }
				: {
					sortBy: 'listedAtDesc',
					limit: 100,
					offset,
					attributes: '{"satributes":["Block 9 450x","Block 9"]}',
					disablePendingTransactions: true,
				};
			
			const URLparams = new URLSearchParams();
			Object.entries(params).forEach(([key, value]) => {
				URLparams.append(key, value);
			});

			const response = await fetch(endpoint + '?' + URLparams.toString(), {
				method: "GET",
				headers: headers,
				mode: 'cors',
				retries: 2,
				retryDelay: function (attempt, error, response) {
					const delay = Math.pow(2, attempt) * 2000; // 1000, 2000, 4000
					console.log(`Retrying in ${delay}ms`, error, response);
					return delay;
				},
				retryOn: [504],
			});
			const result = await response.json();
			console.log('result', result);
			const tokens = result.tokens || [];
			const compressedData = { tokens: tokens.map(compressListing) };

			cleanupCache();
			localStorage.setItem(cacheKey, JSON.stringify(compressedData));
			localStorage.setItem(cacheKey + 'Time', Date.now().toString());

			accumulator.push(...compressedData.tokens);
			if (tokens.length === 100) {
				return fetchPage(offset + 100, accumulator, isSponsored);
			}
			return accumulator;
		} catch (error) {
			console.error('Error fetching page:', error);
			return accumulator;
		}
	};

	try {
		const [sponsorListings, regularListings] = await Promise.all([
			fetchPage(0, [], true),
			fetchPage(0, [], false),
		]);

		const sponsors = processListings(sponsorListings);
		const regular = processListings(regularListings);

		return { sponsors, regular };
	} catch (error) {
		console.error('Error fetching listings:', error);
		return { sponsors: [], regular: [] };
	}
};

/** 
 * Compute positions for each tile in a single “level.”
 * We'll still do the layout with multiple rows per level, etc.
 */
const computeLevelPositions = (listingsLevel, layout, levelIndex) => {
	const { pattern, tileSize, startY } = layout;
	const reversedPattern = [...pattern].reverse();
	const isEvenLayer = levelIndex % 2 === 0;
	const rowPattern = isEvenLayer ? pattern : reversedPattern;

	const arranged = [];
	listingsLevel.forEach((listing, i) => {
		let tileCount = 0;
		for (let rowIndex = 0; rowIndex < rowPattern.length; rowIndex++) {
			if (i < tileCount + rowPattern[rowIndex]) {
				const colIndex = i - tileCount;
				const xStart = layout.getRowX(rowPattern[rowIndex]);
				const yStart =
					startY + rowIndex * (tileSize + LAYOUT_CONSTANTS.TILE_SPACING);

				arranged.push({
					...listing,
					x: xStart + colIndex * (tileSize + LAYOUT_CONSTANTS.TILE_SPACING),
					y: yStart,
					width: tileSize,
					height: tileSize,
					key: `level-${levelIndex}-pos-${i}`,
				});
				break;
			}
			tileCount += rowPattern[rowIndex];
		}
	});
	return arranged;
};

// =============== MAIN COMPONENT ===============

const RareSats = () => {
	const containerRef = useRef(null);
	const [listings, setListings] = useState({ regular: [], sponsors: [] });
	const [showSponsors, setShowSponsors] = useState(false);
	const [visibleRange, setVisibleRange] = useState([0, VISIBLE_LEVELS]);
	const [activeLevels, setActiveLevels] = useState(new Set([0, 1, 2, 3]));
	const [loading, setLoading] = useState(true);
	const [loadingFade, setLoadingFade] = useState(false);
	const [layers, setLayers] = useState([0, 1, 2, 3]);
	const [exitingLayer, setExitingLayer] = useState(null);
	const [enteringLayer, setEnteringLayer] = useState(null);
	const [exitDirection, setExitDirection] = useState(null);

	useEffect(() => {
		const loadListings = async () => {
			setLoading(true);
			try {
				const result = await fetchAllListings();
				setListings(result);
				setLoadingFade(true);
				setTimeout(() => setLoading(false), 1000);
			} catch (error) {
				console.error('Failed to load listings:', error);
			}
		};
		loadListings();
	}, []);

	const calculateGridLayout = (containerWidth, containerHeight) => {
		const width = Math.max(LAYOUT_CONSTANTS.MIN_CONTAINER_SIZE, containerWidth);
		const height = Math.max(LAYOUT_CONSTANTS.MIN_CONTAINER_SIZE, containerHeight);

		const tileSize = Math.min(
			Math.floor(
				(width -
					LAYOUT_CONSTANTS.EDGE_PADDING * 2 -
					(LAYOUT_CONSTANTS.MAX_TILES_PER_ROW - 1) *
					LAYOUT_CONSTANTS.TILE_SPACING) /
				LAYOUT_CONSTANTS.MAX_TILES_PER_ROW
			),
			Math.floor(
				(height -
					LAYOUT_CONSTANTS.EDGE_PADDING * 2 -
					3 * LAYOUT_CONSTANTS.TILE_SPACING) /
				4
			),
			LAYOUT_CONSTANTS.MAX_TILE_SIZE
		);

		const finalTileSize = Math.max(tileSize, LAYOUT_CONSTANTS.MIN_TILE_SIZE);
		let basePattern = [5, 4, 5, 4]; // 18 tiles total
		if(width < 500) {
			basePattern = [4, 3, 4, 3]; // 14 tiles total
		}
		if(height > 800) {
			basePattern[4] = basePattern[0];
			basePattern[5] = basePattern[1];
		}
		
		const totalRows = basePattern.length;
		const stackHeight =
			totalRows * finalTileSize +
			(totalRows - 1) * LAYOUT_CONSTANTS.TILE_SPACING;
		const startY = (height - stackHeight) / 2;

		return {
			tileSize: finalTileSize,
			startY,
			pattern: basePattern,
			getRowX: (tilesInRow) => {
				const rowWidth =
					tilesInRow * finalTileSize +
					(tilesInRow - 1) * LAYOUT_CONSTANTS.TILE_SPACING;
				return (width - rowWidth) / 2;
			},
		};
	};

	const getLevels = () => {
		const active = showSponsors ? listings.sponsors : listings.regular;
		if (!active || !active.length) return [];
		const containerBox =
			containerRef.current?.getBoundingClientRect() || {
				width: 800,
				height: 600,
			};
		const layout = calculateGridLayout(containerBox.width, containerBox.height);

		const levelsArr = [];
		const levelCount = Math.ceil(active.length / TILES_PER_LEVEL);
		for (let lvl = 0; lvl < levelCount; lvl++) {
			if (!activeLevels.has(lvl)) {
				levelsArr[lvl] = null;
				continue;
			}
			const startIdx = lvl * TILES_PER_LEVEL;
			const endIdx = Math.min(active.length, startIdx + TILES_PER_LEVEL);
			const levelListings = active.slice(startIdx, endIdx);
			const arranged = computeLevelPositions(levelListings, layout, lvl);
			levelsArr[lvl] = arranged;
		}
		return levelsArr; // No filter(Boolean) so indexes remain consistent
	};

	const getTotalLevels = () => {
		const activeListings = showSponsors ? listings.sponsors : listings.regular;
		return Math.ceil(activeListings.length / TILES_PER_LEVEL);
	};

	const handleScroll = useDebounce((e) => {
		const delta = -Math.sign(e.deltaY);
		const maxLevels = getTotalLevels();
		
		// Set exit/enter direction
		const direction = delta > 0 ? 'up' : 'down';
		setExitDirection(direction);
		
		// Mark exiting and entering layers
		setExitingLayer(direction === 'up' ? visibleRange[0] : visibleRange[1] - 1);
		setEnteringLayer(direction === 'up' ? visibleRange[1] : visibleRange[0] - 1);
		console.log('Exiting:', exitingLayer, 'Entering:', enteringLayer, visibleRange, direction);

		setTimeout(() => {
			setVisibleRange(([start, end]) => {
				const newStart = Math.max(0, start + delta);
				const newEnd = Math.min(maxLevels, newStart + VISIBLE_LEVELS);
				
				// Update active levels including buffer
				const newActiveLevels = new Set();
				for (let i = Math.max(0, newStart - BUFFER_LEVELS); 
					 i < Math.min(maxLevels, newEnd + BUFFER_LEVELS); i++) {
					newActiveLevels.add(i);
				}
				setActiveLevels(newActiveLevels);
				
				return [newStart, newEnd];
			});
			setExitingLayer(null);
			setEnteringLayer(null);
		}, 400);
	}, 100);


	return (
		<GameContainer ref={containerRef}>
			{loading && (
				<LoadingOverlay fading={loadingFade}>
					<Title>Rare Sats</Title>
					<LoadingText>(Alpha Preview) Loading...</LoadingText>
				</LoadingOverlay>
			)}

			{!loading && (
				<>

					<TileStack onWheel={handleScroll}>
						{getLevels()
							.slice(visibleRange[0], visibleRange[1])
							.map((level, idx) => {
								const realLevelIndex = visibleRange[0] + idx;
								const isVisible = activeLevels.has(realLevelIndex);

								if (!level) return null; // If null, skip rendering

								return (
									<Layer 
										key={`layer-${realLevelIndex}`}
										index={idx}
										isExiting={exitingLayer === realLevelIndex}
										isEntering={enteringLayer === realLevelIndex}
										exitDirection={exitDirection}
									>
										{level.map(tile => (
											<TileWrapper
												key={tile.key}
												x={tile.x}
												y={tile.y}
												faceWidth={tile.width}
												faceHeight={tile.height}
												onClick={() => window.open(`https://magiceden.io/ordinals/marketplace/rare-sats?search=%22${tile.sat}%22`, '_blank')}
											>
												<Faux3DTileContainer
													layerIndex={idx}
													key={tile.key}
												>
													{/* Left edge */}
													<TileLeft
														sideColor={getBlockColor(tile.blockPosition)}
														faceHeight={tile.height}
													/>
													{/* Bottom edge */}
													<TileBottom
														sideColor={getBlockColor(tile.blockPosition)}
														faceWidth={tile.width}
														faceHeight={tile.height}

													/>
													{/* Main tile face */}
													<TileFace
														faceWidth={tile.width}
														faceHeight={tile.height}
														topColor={getSatColor(tile.sat)}
													>
														<Price>{tile.price.toFixed(6)} BTC</Price>
														<RangeCount>{tile.rangeCount}</RangeCount>
														<SatNumberOriental faceSize={tile.width}>
															{splitSatNumberIntoFour(tile.sat).map((line, idx) => (
																<div key={idx}>{line}</div>
															))}
														</SatNumberOriental>
														<div style={{ display: 'flex', justifyContent: 'center', gap: '4px' }}>
															{tile.sattributes.map((sat, idx) => (
																<div
																	key={idx}
																	title={sat}
																	style={{
																		width: '8px',
																		height: '8px',
																		borderRadius: '50%',
																		backgroundColor: `hsl(${(idx * 137.5) % 360}, 70%, 50%)`,
																	}}
																/>
															))}
														</div>
													</TileFace>
												</Faux3DTileContainer>
											</TileWrapper>
										))}
									</Layer>
								);
							})}
					<ScrollIndicator>
						<Arrow
							direction="bottom"
							isActive={visibleRange[0] > 0}
							onClick={() => handleScroll({ deltaY: 100 })}
						/>
						<LevelCounter>
							{visibleRange[0] + 1} / {getTotalLevels()}
						</LevelCounter>
						<Arrow
							direction="top"
							isActive={visibleRange[1] < getTotalLevels()}
							onClick={() => handleScroll({ deltaY: -100 })}
						/>
					</ScrollIndicator>
					</TileStack>

				</>
			)}
		</GameContainer>
	);
};

export default RareSats;
