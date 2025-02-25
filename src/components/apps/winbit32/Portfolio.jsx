import React, { useCallback, useEffect } from 'react';
import { useWindowSKClient } from '../../contexts/SKClientProviderManager';
import './styles/Wallet.css';
import './styles/smart.css';
import DataTable, { defaultThemes } from 'react-data-table-component';
import { QRCodeSVG } from 'qrcode.react';
import { FaCopy } from 'react-icons/fa';
import { getExplorerAddressUrl, formatNumber } from './helpers/transaction';
import { fetchMultipleTokenPrices } from './includes/tokenUtils';
import { useIsolatedState } from '../../win/includes/customHooks';
import { copyToClipboard } from '../../win/includes/utils';
import { DerivationPath } from '@swapkit/sdk';




const Portfolio = ({ providerKey, handleOpenArray, onOpenWindow, windowId }) => {
	//const handleOpenWindow = handleOpenArray[0]; // const handleOpenWindow = (program, metadata, saveState = true) => { ... }; - metadata.phrase for winbit32.exe

	const [data, setData] = useIsolatedState(windowId, 'data', []);
	const [usdPrices, setUsdPrices] = useIsolatedState(windowId, 'usdPrices', []);
	const [walletTotals, setWalletTotals] = useIsolatedState(windowId, 'walletTotals', []);

	const handleOpenWindow = useCallback((program, metadata, saveState = true) => {

	

		onOpenWindow(program, metadata, saveState);

	}, [onOpenWindow]);


	const { wallets, tokens, setWallets } = useWindowSKClient(providerKey);

	const identifierFromBalance = useCallback((balance) => {
		return balance.chain + (balance.isSynthetic ? '/' : '.') + balance.ticker + (balance.address && !balance.isGasAsset ? '-' + balance.address.toUpperCase().replace('0X', '0x') : '');
	}, []);

	const getTokenfromBalanceToken = useCallback((balanceToken) => {

		const tokenIdentifier = identifierFromBalance(balanceToken);
		const token = tokens.find(token => token.identifier.toLowerCase() === tokenIdentifier.toLowerCase());
		if (!token) {
			console.log("Token not found for identifier: ", tokenIdentifier);
			return;
		}

		token.identifier = token.identifier.replace('0X', '0x')

		return token;
	}, [identifierFromBalance, tokens]);


	const getUSDValues = useCallback((wallets) => {

		let tokensToFetch = [];

		wallets.forEach(wallet => {
			if(!wallet.tokens){
				wallet.tokens = [];
			}
			wallet.balance.forEach(balance => {
				if(balance.bigIntValue === 0){
					return;
				}
				
				const token = getTokenfromBalanceToken(balance);
				if(!token){
					return;
				}

				const usdPrice = usdPrices.find(price => price.identifier.toLowerCase() === token.identifier.toLowerCase());
					

				if (!usdPrice || (usdPrice.priceUsdFetchTime && Date.now() - usdPrice.priceUsdFetchTime > 60000)){

					tokensToFetch.push(token.identifier);
				}
			}
			);
		});

		if(tokensToFetch.length === 0){
			return;
		}

		// 		const tokenUSDPrices = data.map((item) => {
		// 	return {
		// 		identifier: item.identifier,
		// 		price_usd: item.price_usd,
		// 		time: Date.now()
		// 	};
		// });

		fetchMultipleTokenPrices(tokensToFetch).then((prices) => {
			console.log('Prices fetched: ', prices);
			if(!prices){
				return;
			}

			//set an object of priceusd/time objects with identifier as key
			const newPrices = prices.map(price => {
				return { identifier: price.identifier, priceUsd: price.price_usd, priceUsdFetchTime: price.time };
			});

			console.log('Setting new prices: ', newPrices);

			setUsdPrices([...usdPrices, ...newPrices]);
			
		});
	}, [getTokenfromBalanceToken, setUsdPrices, usdPrices]);


	useEffect(() => {
		if (!wallets || wallets.length === 0) {
			return;
		}

		const walletTotals = wallets.map(wallet => {

			if(usdPrices.length === 0){
				return { totalUSD: false, chain: wallet.chain };
			}

			const totalUSD = wallet.balance.reduce((total, balance) => {
				const token = getTokenfromBalanceToken(balance);
				if(!token){
					// console.log('Token not found for balance: ', balance);
					return total;
				}

				const usdPrice = usdPrices.find(price => price.identifier.toLowerCase() === token.identifier.toLowerCase());
				console.log('USD Price: ', usdPrice);
				if(!usdPrice){
					return total;
				}
				console.log("Toke found for balance", balance, total, Number(balance.bigIntValue) / Number(balance.decimalMultiplier), usdPrice.priceUsd, Number(balance.bigIntValue) / Number(balance.decimalMultiplier) * usdPrice.priceUsd, total + Number(balance.bigIntValue) / Number(balance.decimalMultiplier) * usdPrice.priceUsd);
				return total + Number(balance.bigIntValue) / Number(balance.decimalMultiplier) * usdPrice.priceUsd;
			}, 0);

			const chain = wallet?.balance[0]?.chain;

			return { totalUSD, chain };

		});
		console.log('Setting wallet totals: ', walletTotals);
		setWalletTotals(walletTotals);

	}, [usdPrices, wallets]);

		

	useEffect(() => {

		console.log('Wallets changed: ', wallets);

		const t = setTimeout(() => {
			getUSDValues(wallets);
		}, 8000);

		return () => clearTimeout(t);
	}, [wallets]);


	useEffect(() => {
		const datasource = wallets.map(wallet => ({
			chain: wallet.chain, // [0] is used to get the chain of the first token in the wallet. All tokens in the wallet are assumed to be of the same chain
			symbol: wallet.balance?.find(b => b.isGasAsset)?.symbol || wallet.balance[0]?.symbol,
			address: wallet.address,
			derivationPath: wallet.derivationPath,
			ticker: wallet.balance?.find(b => b.isGasAsset)?.ticker || wallet.balance[0]?.ticker,
			balance: wallet.balance.find(b => b.isGasAsset)?.bigIntValue ? Number(wallet.balance.find(b => b.isGasAsset).bigIntValue) / Number(wallet.balance.find(b => b.isGasAsset).decimalMultiplier) : Number(wallet.balance[0].bigIntValue) / Number(wallet.balance[0].decimalMultiplier),
			link: getExplorerAddressUrl(wallet.chain, wallet.address).replace('https://dashboard.radixdlt.com/address/', 'https://dashboard.radixdlt.com/account/'),
			totalUSD: walletTotals.find(total => total.chain === wallet.chain)? '$'+(formatNumber(walletTotals.find(total => total.chain === wallet.chain)?.totalUSD,2) || '--') : '-',
			totalUSDSort: walletTotals.find(total => total.chain === wallet.chain) ? walletTotals.find(total => total.chain === wallet.chain)?.totalUSD : Number(wallet.balance[0].bigIntValue) / 10 ** 36,
			tokens: wallet.balance ? wallet.balance.map(token => ({
				symbol: token.symbol,
				ticker: token.ticker,
				balance: Number(token.bigIntValue) / Number(token.decimalMultiplier),
				totalUSD: Number(token.bigIntValue) / Number(token.decimalMultiplier) * usdPrices.find(price => price.identifier.toLowerCase() === identifierFromBalance(token).toLowerCase())?.priceUsd, 
				priceUSD: usdPrices.find(price => price.identifier.toLowerCase() === identifierFromBalance(token).toLowerCase())?.priceUsd,
				address: token.address,
				fullToken: token
			})) : []
		}));
		console.log('Setting data: ', datasource);
		setData(datasource);
	}, [wallets, walletTotals, setData, identifierFromBalance]);


	if (!wallets || wallets.length === 0) {
		return <div>No wallets connected</div>;
	}





	const customStyles = {
		header: {
			style: {
				minHeight: '56px',
			},
		},
		headRow: {
			style: {
				borderTopStyle: 'solid',
				borderTopWidth: '1px',
				borderTopColor: defaultThemes.default.divider.default,
			},
		},
		cells: {
			style: {
				'&:not(:last-of-type)': {
					borderRightStyle: 'solid',
					borderRightWidth: '1px',
					borderRightColor: defaultThemes.default.divider.default,
				},
			},
		},
	};





	const ExpandedComponent = ({ data }) => (
		<div style={{textAlign: 'center', display:'flex', flexDirection: 'column', 'alignItems':'center'}}>
			<h2>{data.chain} {data.derivationPath}</h2>
			<QRCodeSVG value={data.address} />
			<div style={{ marginBottom: '10px', marginTop: '10px', maxWidth: '400px' }}><strong>Address:</strong>  <div style={{ fontSize: '80%' }} className='selectable'>{data.address}</div></div>
			<table style={{ margin: 'auto', textAlign: 'left', userSelect: 'text' }}>
			{data.tokens.map((token, index) => (
				<tr key={index} style={{ marginBottom: '10px', padding: '10px', borderBottom: '1px solid grey' }}>
					<td title={token.symbol} style={{maxWidth:'300px', overflow:'hidden', 'whiteSpace': 'nowrap', 'textOverflow': 'ellipsis'}}>	 {token.ticker}</td>
					<td style={{ cursor: 'pointer' }} onClick={() => copyToClipboard(token.address, this)} title={"Copy this token's address: " + token.address}>📋</td>
					<td style={{ maxWidth: '300px', overflow: 'hidden', 'whiteSpace': 'nowrap', 'textOverflow': 'ellipsis' }}>{formatNumber(token.balance)}</td>
					<td style={{ maxWidth: '100px', overflow: 'hidden', 'whiteSpace': 'nowrap', 'textOverflow': 'ellipsis' }}>{token.totalUSD ? '$' + token.totalUSD.toFixed(2) : 'N/A'}</td>
					<td onClick={() => handleOpenWindow('send.exe', { selectedToken: getTokenfromBalanceToken(token.fullToken) })} style={{ cursor: 'pointer' }} title="Send this token to someone else">✉️</td>
					<td onClick={() => handleOpenWindow('exchange.exe', { swapFrom: getTokenfromBalanceToken(token.fullToken) })} style={{ cursor: 'pointer' }} title="Transform this token into another">🔀</td>
				</tr>
			))}
			</table>
		</div>
	);

	const columns = [
		{ name: 'Chain', selector: row => row.chain, width: '75px', sortable: true },
		// { name: 'Token', selector: row => row.ticker, width: '100px', sortable: true, hide: 'sm' },
		{
			name: 'Address', selector: row => row.address, grow: 2, cell: row => (
				<div>
					<FaCopy onClick={() => copyToClipboard(row.address, this)} style={{ cursor: 'pointer' }} /> {row.address}
				</div>
			)
		},
		{ name: 'Balance', selector: row => row.totalUSD, right: true, hide: 'sm', sortable: true},
		
		{ name: 'Explorer', selector: row => row.link, cell: row => (<a href={row.link} target="_blank" rel="noreferrer">⛓</a>), right: true, width: '50px'}

	];


	return (
		<div className="wallet-program" style={{maxWidth: '100%'}}>
			<DataTable
				data={data}
				columns={columns}
				dense
				customStyles={customStyles}
				expandOnRowClicked
				expandableRows
				expandableRowsComponent={ExpandedComponent}
				height="100%"
				width="100%"
				responsive
				striped
				defaultSortFieldId={1}
			/>
		</div>
	);
};

export default Portfolio;
