import { HDNode } from "@ethersproject/hdnode";
import { Wallet } from "@ethersproject/wallet";
import { Chain, DerivationPath, WalletOption } from "@thorswap-lib/types";
import {
	bitcoincashWalletMethods,
	thorchainWalletMethods,
} from "@thorswap-lib/helpers";

const getWalletMethodsForChain = async ({
	api,
	rpcUrl,
	chain,
	phrase,
	ethplorerApiKey,
	covalentApiKey,
	utxoApiKey,
	index,
	stagenet,
}) => {
	console.log(
		`getWalletMethodsForChain called with chain: ${chain}, phrase: ${phrase}`
	);
	const derivationPath = `${DerivationPath[chain]}/${index}`;
	console.log(`Derivation path: ${derivationPath}`);

	switch (chain) {
		case Chain.BinanceSmartChain:
		case Chain.Avalanche:
		case Chain.Ethereum: {
			if (chain === Chain.Ethereum && !ethplorerApiKey) {
				throw new Error("Ethplorer API key not found");
			} else if (!covalentApiKey) {
				throw new Error("Covalent API key not found");
			}

			const { getProvider, ETHToolbox, AVAXToolbox, BSCToolbox } = await import(
				"@swapkit/toolbox-evm"
			);

			const hdNode = HDNode.fromMnemonic(phrase);
			const derivedPath = hdNode.derivePath(derivationPath);
			console.log(`Derived path address: ${derivedPath.address}`);

			const provider = getProvider(chain, rpcUrl);
			const wallet = new Wallet(derivedPath).connect(provider);
			const params = { api, provider, signer: wallet };

			const toolbox =
				chain === Chain.Ethereum
					? ETHToolbox({ ...params, ethplorerApiKey })
					: chain === Chain.Avalanche
					? AVAXToolbox({ ...params, covalentApiKey })
					: BSCToolbox({ ...params, covalentApiKey });

			return {
				address: derivedPath.address,
				walletMethods: {
					...toolbox,
					getAddress: () => derivedPath.address,
				},
			};
		}

		case Chain.BitcoinCash: {
			if (!utxoApiKey) throw new Error("UTXO API key not found");
			const walletMethods = await bitcoincashWalletMethods({
				rpcUrl,
				phrase,
				derivationPath,
				utxoApiKey,
			});

			return { address: walletMethods.getAddress(), walletMethods };
		}

		// Add cases for other chains...

		case Chain.THORChain: {
			const walletMethods = await thorchainWalletMethods({ phrase, stagenet });

			return { address: walletMethods.getAddress(), walletMethods };
		}

		default:
			throw new Error(`Unsupported chain ${chain}`);
	}
};

const customConnectKeystore =
	({
		addChain,
		apis,
		rpcUrls,
		config: { covalentApiKey, ethplorerApiKey, utxoApiKey, stagenet },
	}) =>
	async (chains, phrase, index = 0) => {
		console.log("connectKeystore called with phrase:", phrase);
		const promises = chains.map(async (chain) => {
			console.log(`Connecting to chain: ${chain}`);
			const { address, walletMethods } = await getWalletMethodsForChain({
				index,
				chain,
				api: apis[chain],
				rpcUrl: rpcUrls[chain],
				covalentApiKey,
				ethplorerApiKey,
				phrase,
				utxoApiKey,
				stagenet,
			});

			addChain({
				chain,
				walletMethods,
				wallet: { address, balance: [], walletType: WalletOption.KEYSTORE },
			});

			console.log(`Connected to chain: ${chain} with address: ${address}`);
		});

		await Promise.all(promises);

		return true;
	};

export const customKeystoreWallet = {
	connectMethodName: "connectKeystore",
	connect: customConnectKeystore,
};
