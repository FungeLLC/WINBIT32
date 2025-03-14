import { RequestClient } from "@swapkit/helpers";
import { ChainToExplorerUrl, Chain } from "@swapkit/sdk";
import bigInt from "big-integer";

const baseUrlV1 = "https://api.thorswap.net";

export const formatNumber = (number, precision = 8) => {
	if(!number && number !== 0) return false;
	number = parseFloat(number);
	
	if (number < 1) {
		return number.toFixed(precision);
	} else if (number < 10) {
		return number.toFixed(2);
	} else if (number < 100) {
		return number.toFixed(3);
	} else if (number < 1000) {
		return number.toFixed(2);
	}
	return Math.floor(number);
};

export const formatUSDValue = (value) => {
  if (!value && value !== 0) return '';
  return `($${formatNumber(value, 2)})`;
};

export const formatBalanceWithUSD = (balance, usdValue) => {
  if (!balance) return '0';
  const formattedBalance = formatBalance(balance);
  const formattedUSD = formatUSDValue(usdValue);
  return `${formattedBalance} ${formattedUSD}`;
};

export const formatBalance = (balance) => {
  if (!balance) return '0';

  // Handle array of balances
  if (Array.isArray(balance)) {
    return formatNumber(
      balance.reduce((sum, b) => sum + (parseFloat(b.amount) || 0), 0)
    );
  }

  // Handle BigInt value
  if (typeof balance === 'bigint') {
    return formatNumber(Number(balance) / 1e8);
  }

  // Handle object with balance field
  if (balance.balance) {
    return formatNumber(parseFloat(balance.balance));
  }

  // Handle object with amount property
  if (balance.amount !== undefined) {
    return formatNumber(parseFloat(balance.amount));
  }

  // Handle decimal & decimalMultiplier
  if (balance.decimal !== undefined && balance.bigIntValue !== undefined) {
    return formatNumber(Number(balance.bigIntValue) / Math.pow(10, balance.decimal));
  }

  // Handle simple number
  return formatNumber(balance);
};



export function getExplorerAddressUrl(
	chain,
	address,
) {
	const baseUrl = ChainToExplorerUrl[chain];

	switch (chain) {
		case Chain.Solana:
			return `${baseUrl}/account/${address}`;

		default:
			return `${baseUrl}/address/${address}`;
	}
}
//https://api.thorswap.net/tracker/v2/txn

export async function getTxnDetails(txHash) {

	if(typeof txHash === "object"){

		if(txHash.signature){
			txHash = [txHash.signature, txHash.chainId];
		}else{
			txHash = [txHash.hash, txHash.chainId];
		}
	}

	console.log("getTxnDetails", txHash);
	
	const url = `https://crunchy.dorito.club/api/track`;

	const body = {
		hash: txHash[0],
		chainId: txHash[1],
	}

	let res = await RequestClient.post(url, {
		body: JSON.stringify(body),
		headers: {
			"Content-Type": "application/json",
		},
	});


	console.log('res', res);

	if(!res.status){
		res.status = 'pending';
	}


	return {
		...res,
		done: (res.status === 'completed'),
		status: res.status,
		txn: res.txn || txHash[0],
		lastCheckTime: new Date(),
	}
}

export function getTxnDetailsV2(txHash, from) {
	console.log("getTxnDetails", txHash);
	//https://api.thorswap.net/tracker/txn?txid=B0E4F485F65F0771DABE3004B30E8CDD5AF85639745DEF6C7737F92D1527D044&from=thor1wjr2az7ccjvyvuuw3mp9j60vx0rcazyzy2mqs7&type=SWAP%3ATC-TC
	return RequestClient.get(`${baseUrlV1}/tracker/txn?txid=${txHash}&from=${from}&type=SWAP%3ATC-TC`);
}


export const checkTxnStatus = async (
	txnHash,
	_txnHash,
	cnt,
	swapInProgress,
	txnStatus,
	setStatusText,
	setSwapInProgress,
	setShowProgress,
	setProgress,
	setTxnStatus,
	setTxnTimer,
	txnTimerRef
) => {
	console.log(
		"checkTxnStatus",
		txnHash,
		_txnHash,
		cnt,
		swapInProgress,
		txnStatus,
		txnStatus?.lastCheckTime,
		new Date() - txnStatus?.lastCheckTime > 1000
	);
	if (
		swapInProgress &&
		txnHash &&
		txnHash.length > 0 &&
		txnHash === _txnHash &&
		txnStatus?.done !== true &&
		txnStatus?.lastCheckTime &&
		new Date() - txnStatus?.lastCheckTime > 1000 &&
		cnt < 100
	) {
		console.log("Getting txn details", txnHash);
		
		const status = await getTxnDetails(txnHash).catch(
			(error) => {
				//setStatusText("Error getting transaction details");
				setSwapInProgress(false);
				setShowProgress(false);
				return null;
			}
		);
		if (!status) {
			console.log("no status", status);
			setTxnTimer(
				setTimeout(() => {
					checkTxnStatus(
						txnHash,
						txnHash[0],
						cnt + 1,
						swapInProgress,
						txnStatus,
						setStatusText,
						setSwapInProgress,
						setShowProgress,
						setProgress,
						setTxnStatus,
						setTxnTimer,
						txnTimerRef
					);
				}, 30000)
			);
			return;
		}
		status.lastCheckTime = new Date();
		setTxnStatus(status);
		console.log("status", status);
		if (status?.done === false) {
			setProgress((prev) => (prev < 95 ? prev + 1 : 95));
			const delay =
				((status.result.legs.slice(-1).estimatedEndTimestamp -
					status.result.startTimestamp) /
					80) *
					1000 || 10000;
			if (!cnt) cnt = 0;

			if (txnTimerRef.current) clearTimeout(txnTimerRef.current);

			setTxnTimer(
				setTimeout(() => {
					checkTxnStatus(
						txnHash,
						txnHash[0],
						cnt + 1,
						swapInProgress,
						txnStatus,
						setStatusText,
						setSwapInProgress,
						setShowProgress,
						setProgress,
						setTxnStatus,
						setTxnTimer,
						txnTimerRef
					);
				}, delay)
			);
		} else if (status?.done === true) {
			setStatusText("Transaction complete");
			console.log("status done", status);
			setProgress(100);
			setSwapInProgress(false);
		}
	} else if (
		txnStatus?.done === true ||
		txnStatus?.error ||
		txnStatus?.txn?.route?.complete === true
	) {
		if (txnStatus?.error?.message) {
			setStatusText("Please follow the transaction on the link below");
		} else {
			setStatusText("Transaction complete");
		}
		console.log("status done2 ", txnStatus);
		setProgress(100);
		setSwapInProgress(false);
	}
};


export const getTxnUrl = (txHash, chain, skClient) => {
	try {
		if(typeof txHash === "string"){
			txHash = [txHash, chain];
		}else if(typeof txHash === "object"){
			txHash = [txHash.signature, chain];
		}

		
		if(txHash === null){
			return "";
		}

		if(txHash.length === 0){
			return "";
		}
		
		if(!chain){
			chain = chainIdToChain[txHash[1]];
		}
		
		switch (chain) {
			case Chain.THORChain:
			case Chain.Maya:
			case Chain.Bitcoin:
			case Chain.Ethereum:
				return `https://www.xscanner.org/tx/${txHash[0]}`;

			case Chain.Solana:
				return 'https://solscan.io/tx/' + txHash[0];
			default:
				return skClient.getExplorerTxUrl({ chain, txHash: txHash[0] });
		}
	} catch (error) {
		console.log("error", error, txHash, chain, skClient);
		if (chain === "XRD" || chain === 'radix-mainnet') {
			if (txHash?.[0]?.id)
				return `https://dashboard.radixdlt.com/transaction/${txHash?.[0]?.id}`;
			else return `https://dashboard.radixdlt.com/transaction/${txHash?.[0]}`;
		} else {
			return "https://www.xscanner.org/tx/" + txHash?.[0];
		}
	}
}
