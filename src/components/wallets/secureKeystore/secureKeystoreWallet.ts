import {
	Chain,
	ChainId,
	type ConnectWalletParams,
	DerivationPath,
	type DerivationPathArray,
	RPCUrl,
	type WalletChain,
	derivationPathToString,
	ensureEVMApiKeys,
	setRequestClientConfig,
	ChainToChainId
} from "@swapkit/helpers";
import { decryptFromKeystore, Keystore } from "@swapkit/wallet-keystore";
import { mnemonicToSeedSync } from 'bip39';
import { derivePath as deriveEd25519Path } from 'ed25519-hd-key';
import { HDKey } from "@scure/bip32";
import {
	PrivateKey,
} from "@radixdlt/radix-engine-toolkit";
import { ECPairFactory, type ECPairInterface } from "ecpair";

import { wbRadixToolbox } from "../../plugins/winbitRadixToolbox.ts";
import { HDNodeWallet, getProvider, getToolboxByChain as getToolboxByChainEVM } from "@swapkit/toolbox-evm";
import { BCHToolbox } from "@swapkit/toolbox-utxo";
import { getToolboxByChain as getToolboxByChainUTXO } from "@swapkit/toolbox-utxo";
import { getToolboxByChain as getToolboxByChainCosmos } from "../../toolbox/cosmos/index.ts";
import { getToolboxByChain as getToolboxByChainSubstrate } from "../../plugins/substrateToolboxFactory.ts";
import { Network, createKeyring } from "@swapkit/toolbox-substrate";

import { getRadixCoreApiClient, createPrivateKey, RadixMainnet } from "./legacyRadix.ts";
import { SOLToolbox } from "../../toolbox/solana/toolbox.ts";
import { createKeysForPath as createSolanaKeysForPath } from "../../toolbox/solana/toolbox.ts";
import { addDialogOptions } from "./dialogOptions"
import { Wallet as ethersWallet, Wallet } from "ethers";
import { getNetwork } from "@swapkit/toolbox-utxo";
import * as secp256k1 from "@bitcoinerlab/secp256k1";


const derivationPathAccountPositions = {
	SOL: 3,
};

// Add to existing code at top
const isPK = (phrase: string) => phrase.trim().split(' ').length === 1;


const UTXOcreateKeysForPath = ({
	phrase,
	wif,
	derivationPath,
	chain,
}: {
	phrase?: string;
	wif?: string;
	derivationPath: string;
	chain: Chain;
}) => {
	if (!(wif || phrase)) throw new Error("Either phrase or wif must be provided");

	const factory = ECPairFactory(secp256k1);
	const network = getNetwork(chain);

	// Handle WIF format directly
	if (wif) return factory.fromWIF(wif, network);

	// Check if phrase is actually a private key
	if (phrase?.split(' ').length === 1) {
		return factory.fromPrivateKey(Buffer.from(phrase, 'hex'), { network });
	}

	// Handle mnemonic phrase
	const seed = mnemonicToSeedSync(phrase as string);
	const master = HDKey.fromMasterSeed(seed, network).derive(derivationPath);
	if (!master.privateKey) throw new Error("Could not get private key from phrase");

	return factory.fromPrivateKey(Buffer.from(master.privateKey), { network });
};


const addIndexToDerivationPath = (chain: Chain, derivationPath: string, index: number) => {
	const parts = derivationPath.split("/");
	const accountPosition = derivationPathAccountPositions[chain];
	if (!accountPosition || parts.length <= accountPosition) {
		//put it on the end
		return `${DerivationPath[chain]}/${index}`;
	}
	//get part at accountPosition and see if it has a ' at the end
	const part = parts[accountPosition];
	let strIndex = index.toString();
	if (part.endsWith("'")) {
		strIndex = index + "'";
	}

	//replace part at accountPosition with strIndex
	parts[accountPosition] = strIndex;
	return parts.join("/");
};

// Internal variables to store the encrypted keystore and the password request function
let encryptedKeystore: Keystore | null = null;
let passwordRequestFunction: ((options?: object) => Promise<object>) | null = null;

type SecureKeystoreOptions = {
	ethplorerApiKey?: string;
	blockchairApiKey?: string;
	covalentApiKey?: string;
	stagenet?: boolean;
};

type Params = SecureKeystoreOptions & {
	api?: any;
	rpcUrl?: string;
	chain: Chain;
	keystore: Keystore | null;
	passwordRequest: (options?: object) => Promise<object>;
	derivationPath: string;
	password: string;
	otherOptions: object;
};

// Function to set the encrypted keystore
const setEncryptedKeystore = ({ ...params }) => {
	debugLog("SEKParams", params);
	return function setEncryptedKeystore(keystore: Keystore | null) {
		encryptedKeystore = keystore;
	};
};

// Function to set the password request function
const setPasswordRequestFunction = ({ ...params }) => {
	return function setPasswordRequestFunction(passwordFunction: () => Promise<object>) {
		passwordRequestFunction = passwordFunction;
	};
};

// Function to prompt for password
const promptForPassword = () => {
	return async function promptForPassword(...args: any[]) {

		if (!passwordRequestFunction) {
			throw new Error("Password request function is not set.");
		}

		const dArgs = addDialogOptions(args);


		return passwordRequestFunction(dArgs);
	};
};

const debugLog = (message: string, ...args: any[]) => {
	// console.log(message, ...args);
};

// Utility function to wrap sensitive methods
const wrapSensitiveMethods = (toolbox: any, wrapMethod: (functionName: string) => Function, sensitiveMethods: string[]) => {
	const wrappedToolbox: any = {};

	debugLog("SensitiveMethods", sensitiveMethods);

	for (const [key, value] of Object.entries(toolbox)) {
		// Wrap functions if they are in the list of sensitive methods
		if (typeof value === "function" && sensitiveMethods.includes(key)) {
			wrappedToolbox[key] = wrapMethod(key);
			debugLog(`Wrapped sensitive method: ${key}`);
		} else {
			// Copy non-sensitive functions directly
			if (typeof value === "function") {
				debugLog(`Unwrapped method: ${key}`);

				wrappedToolbox[key] = (...args: any[]) => {
					debugLog("Calling on UnwrappedToolbox:", key, toolbox, args);
					return toolbox[key](...args);
				};
			} else {
				debugLog(`Unwrapped value: ${key}`);
				wrappedToolbox[key] = toolbox[key];
			}
		}
	}

	return wrappedToolbox;
};

const getPhrase = async (keystore: Keystore | null, password: string) => {
	console.log("Keystore", keystore);

	if (keystore) {
		return await decryptFromKeystore(keystore, password);
	} else {
		return password;
	}
};

const getWalletMethodsForChain = async ({
	api,
	rpcUrl,
	chain,
	keystore,
	passwordRequest,
	ethplorerApiKey,
	covalentApiKey,
	blockchairApiKey,
	derivationPath,
	stagenet,
	password,
	otherOptions = {},
}: Params) => {
	// Decrypt the phrase once to get the address
	const phrase = keystore ? await getPhrase(keystore, password) : password;
	const networkOptions = otherOptions['networkOptions'] ? otherOptions['networkOptions'] : {};

	//console.log("OtherOptions", otherOptions);

	let index = otherOptions['index'] ? otherOptions['index'] : 0;

	let address: string;
	let toolbox: any;
	let sensitiveMethods: string[] = [];

	switch (chain) {
		case Chain.Arbitrum:
		case Chain.Avalanche:
		case Chain.Base:
		case Chain.BinanceSmartChain:
		case Chain.Ethereum:
		case Chain.Optimism:
		case Chain.Polygon: {
			const keys = ensureEVMApiKeys({ chain, covalentApiKey, ethplorerApiKey });
			const provider = getProvider(chain, rpcUrl);
			const chainId = ChainToChainId[chain];

			// console.log("EVM ChainId", chain, chainId);

			// const cApi = covalentApi({apiKey: covalentApiKey, chainId})

			// console.log("EVM Chain", chain, rpcUrl, provider, keys, phrase);

			const wallet = isPK(phrase)
				? new ethersWallet(phrase).connect(provider)
				: HDNodeWallet.fromPhrase(phrase).connect(provider);
			const params = { ...keys, provider, signer: wallet, api };

			address = wallet.address;

			// Get the base toolbox
			toolbox = getToolboxByChainEVM(chain)(params);
			// Specify sensitive methods for EVM chains
			sensitiveMethods = ['transfer', 'signMessage', 'approve', 'call', 'estimateCall', 'sendTransaction', 'createTransferTx', 'createApprovalTx'];

			// Wrap sensitive methods
			const wrappedToolbox = wrapSensitiveMethods(toolbox, (originalMethodName) => async (...args: any[]) => {
				const { password } = await passwordRequest({ title: "EVM wallet password for " + originalMethodName + " required" }) as { password: string };
				const phrase = await getPhrase(keystore, password);
				const wallet = isPK(phrase)
					? new ethersWallet(phrase).connect(provider)
					: HDNodeWallet.fromPhrase(phrase).connect(provider);
					//console.log("GOT ETHTYPE WALLET", phrase, isPK(phrase), wallet);
				const signerToolbox = getToolboxByChainEVM(chain)({ ...keys, api, provider, signer: wallet });
				debugLog("Calling on WrappedToolbox:", originalMethodName, signerToolbox, args);
				//call originalMethodName on signer
				return signerToolbox[originalMethodName](...args);
			}, sensitiveMethods);

			const balances = await toolbox.getBalance(address);

			return { address, walletMethods: wrappedToolbox, balance: balances };
		}

		case Chain.BitcoinCash: {

			//if phrase is just one word (private key) skip this chain.
			if (isPK(phrase)) {
				throw new Error("Private key not supported for BitcoinCash");
			}

			toolbox = BCHToolbox({ rpcUrl, apiKey: blockchairApiKey, apiClient: api });
			const keys = await toolbox.createKeysForPath({ phrase, derivationPath, chain });
			address = toolbox.getAddressFromKeys(keys);

			// Specify sensitive methods for BitcoinCash
			sensitiveMethods = ['transfer', 'buildTx', 'buildBCHTx'];

			const wrappedToolbox = wrapSensitiveMethods(toolbox, (originalMethod) => async (...args: any[]) => {
				const { password } = await passwordRequest({ title: "BitcoinCash password for " + originalMethod + " required" }) as { password: string };
				const phrase = await getPhrase(keystore, password);
				const keys = await toolbox.createKeysForPath({ phrase, derivationPath, chain });
				debugLog("Calling on WrappedToolbox:", originalMethod, toolbox, args);

				return toolbox.transfer({
					...args[0], from: address, signTransaction: (builder, utxos) => {
						utxos.forEach((utxo, index) => {
							builder.sign(index, keys, undefined, 0x41, utxo.witnessUtxo.value);
						});
						return builder.build();
					}
				});
			}, sensitiveMethods);

			return { address, walletMethods: wrappedToolbox };
		}

		case Chain.Bitcoin:
		case Chain.Dash:
		case Chain.Dogecoin:
		case Chain.Litecoin: {
			toolbox = getToolboxByChainUTXO(chain)({
				rpcUrl,
				apiKey: blockchairApiKey,
				apiClient: api,
			});

			const keys = UTXOcreateKeysForPath({ phrase, derivationPath, chain });
			address = toolbox.getAddressFromKeys(keys);
			// Specify sensitive methods for UTXO chains
			sensitiveMethods = ['transfer', 'createKeysForPath', 'getAddressFromKeys', 'getPrivateKeyFromMnemonic'];

			const wrappedToolbox = wrapSensitiveMethods(toolbox, (originalMethod) => async (...args: any[]) => {
				const { password } = await passwordRequest({ title: "UTXO wallet password for " + originalMethod + " required" }) as { password: string };
				const phrase = await getPhrase(keystore, password);
				const keys = UTXOcreateKeysForPath({ phrase, derivationPath, chain });
				debugLog("Calling on WrappedToolbox:", originalMethod, toolbox, args);
				return toolbox[originalMethod]({
					...args[0], from: address, signTransaction: (psbt) => psbt.signAllInputs(keys)
				});
			}, sensitiveMethods);

			return { address, walletMethods: wrappedToolbox };
		}

		case Chain.Cosmos:
		case Chain.Kujira:
		case Chain.Maya:
		case Chain.THORChain: {
			toolbox = getToolboxByChainCosmos(chain)({ server: api, stagenet });

			const phraseAsUint8Array = new Uint8Array(Buffer.from(phrase, 'hex'));

			const signer = isPK(phrase) ? await toolbox.getSignerFromPrivateKey(phraseAsUint8Array):
				await toolbox.getSigner(phrase);

//			console.log("Signer", chain, signer);

			//address = signer.address;
			const accounts = await signer.getAccounts();

			address = accounts[0].address;

			// Specify sensitive methods for Cosmos-based chains
			sensitiveMethods = ['transfer', 'signMessage', 'deposit', 'getSigner'];
			const wrappedToolbox = wrapSensitiveMethods(toolbox, (originalMethod) => async (...args: any[]) => {
				const { password } = await passwordRequest({ title: "Cosmos wallet password for " + originalMethod + " required" }) as { password: string };
				const phrase = await getPhrase(keystore, password);

				const signer = isPK(phrase)? await toolbox.getSignerFromPrivateKey(phrase):
					await toolbox.getSigner(phrase);

				const accounts = await signer.getAccounts();

				console.log("Accounts", chain, accounts);

				const from = accounts[0].address;

				args[0] = { ...args[0], from, signer };
				debugLog("Calling on WrappedToolbox:", originalMethod, args);

				return toolbox[originalMethod](...args);
			}, sensitiveMethods);

			return { address, walletMethods: wrappedToolbox };
		}

		case Chain.Polkadot:
		case Chain.Chainflip: {

			//if phrase is just one word (private key) then convert to a hex string
			if (isPK(phrase)) {
				phrase = Buffer.from(phrase, 'hex').toString('hex');
			}

			const signer = await createKeyring(phrase, Network[chain].prefix);

			console.log("Substrate Signer", chain, signer);//"wss://api-chainflip.dwellir.com/204dd906-d81d-45b4-8bfa-6f5cc7163dbc"

			toolbox = await getToolboxByChainSubstrate(chain, {
				signer,
				providerUrl: chain === Chain.Polkadot ? RPCUrl.Polkadot : "wss://rpc.chainflip.winbit32.com" as RPCUrl,
			});

			address = signer.address;

			// Specify sensitive methods for Substrate-based chains
			sensitiveMethods = ['transfer', 'signMessage', 'signer', 'estimateTransactionFee', 'signAndBroadcast', 'sign'];

			const wrappedToolbox = wrapSensitiveMethods(toolbox, (originalMethod) => async (...args: any[]) => {
				const { password } = await passwordRequest({ title: "Polkadot wallet password for '" + originalMethod + "'..." }) as { password: string };
				const phrase = await getPhrase(keystore, password);
				const signer = await createKeyring(phrase, Network[chain].prefix);
				toolbox = await getToolboxByChainSubstrate(chain, { signer });
				debugLog("Calling on WrappedToolbox:", originalMethod, toolbox, args);

				return toolbox[originalMethod](...args);
			}, sensitiveMethods);

			return { address, walletMethods: wrappedToolbox };
		}

		case Chain.Radix: {
			const radixNetwork = networkOptions['radixNetwork'] ? networkOptions['radixNetwork'] : 1;

			const isMainnet = radixNetwork === "mainnet";

			const getRadixSigner = async (phrase, index, isMainnet) => {
				if (networkOptions['radixNetwork'] === "legacy") {
					console.log("Connecting Radix the swapkit legacy way");
					return await createPrivateKey(phrase);
				}

				console.log("Connecting Radix the new way", index);
				let seed = mnemonicToSeedSync(phrase);
				const derivationPath = isMainnet ? "m/44'/1022'/1'/525'/1460'/" + index + "'" : "m/44'/1022'/0'/0/" + index + "'";
				console.log("DerivationPath", derivationPath);

				if (isMainnet) {
					const derivedKeys = deriveEd25519Path(derivationPath, seed.toString('hex'));

					console.log("DerivedKeys", derivedKeys);
					const privateKey = new PrivateKey.Ed25519(new Uint8Array(derivedKeys.key));
					return privateKey;
				} else {
					const hdkey = HDKey.fromMasterSeed(seed);
					const derivedKey = hdkey.derive(derivationPath);
					const privateKey = new PrivateKey.Secp256k1(derivedKey.privateKey as Uint8Array);
					return privateKey;
				}
			};

			const api = await getRadixCoreApiClient(RPCUrl.Radix, RadixMainnet);
			const signer = await getRadixSigner(phrase, index, isMainnet);

			toolbox = await wbRadixToolbox({ api, signer });
			address = toolbox.address;
			// Specify sensitive methods for Radix
			sensitiveMethods = ['transfer', 'signMessage', 'validateSignature', 'createPrivateKey', 'transferToAddress'];

			const wrappedToolbox = wrapSensitiveMethods(toolbox, (originalMethod) => async (...args: any[]) => {
				console.log("WrappedToolbox", originalMethod, args);
				const { password } = await passwordRequest({ title: "Enter your Radix wallet password for " + originalMethod + " method" }) as { password: string };
				const phrase = await getPhrase(keystore, password);
				const signer = await getRadixSigner(phrase, index, isMainnet);
				const toolbox = await wbRadixToolbox({ api, signer });
				return toolbox[originalMethod](...args);
			}, sensitiveMethods);

			return { address, walletMethods: wrappedToolbox };
		}

		case Chain.Solana: {
			const keypair = createSolanaKeysForPath({ phrase, derivationPath });
			toolbox = SOLToolbox({ rpcUrl, fromKeypair: keypair });

			address = toolbox.getAddressFromKeys(keypair);

			// Specify sensitive methods for Solana
			sensitiveMethods = ['signMessage', 'signAndSendTransaction', 'signTransaction', 'signAllTransactions', 'transfer', 'getPublicKey'];

			const wrappedToolbox = wrapSensitiveMethods(toolbox, (originalMethod) => async (...args: any[]) => {
				const { password } = await passwordRequest({ title: "Enter your Solana wallet password for " + originalMethod + " method" }) as { password: string };
				const phrase = await getPhrase(keystore, password);
				const keypair = toolbox.createKeysForPath({ phrase, derivationPath });
				args[0] = { ...args[0], from: address, signer: keypair, fromKeypair: keypair };
				if(args[1]){
					args[1] = { ...args[1], fromKeypair: keypair };
				}else{
					args[1] = { fromKeypair: keypair };
				}
				debugLog("Calling on WrappedToolbox:", originalMethod, toolbox, args);

				return toolbox[originalMethod](...args);
			}, sensitiveMethods);

			return { address, walletMethods: wrappedToolbox, derivationPath };
		}

		default:
			throw new Error(`Unsupported chain ${chain}`);
	}
};

function connectSecureKeystore({
	addChain,
	apis,
	rpcUrls,
	config: { thorswapApiKey, covalentApiKey, ethplorerApiKey, blockchairApiKey, stagenet },
}: ConnectWalletParams) {
	

	return async function connectSecureKeystore(
		chains: WalletChain[],
		password: string, // Optional password to skip the user prompt
		derivationPathMapOrIndex?: { [chain in Chain]?: DerivationPathArray } | number,
		otherOptions: object = {}
	) {
		console.log("connectSecureKeystore", apis, rpcUrls, thorswapApiKey, covalentApiKey, ethplorerApiKey, blockchairApiKey, stagenet);

		if (!encryptedKeystore) {
			//throw new Error("Keystore is not set. Please set the encrypted keystore before connecting.");
			//password is phrase
		}

		if (!passwordRequestFunction && !password) {
			throw new Error("Password request function is not set and no password provided.");
		}

		setRequestClientConfig({ apiKey: thorswapApiKey });


		console.log("Chains", chains);
		const promises = chains.map(async (chain) => {
			const dIndex = typeof derivationPathMapOrIndex !== "object" ? derivationPathMapOrIndex : 0;
			const index = typeof derivationPathMapOrIndex === "number" ? derivationPathMapOrIndex === -1 ? 0 : derivationPathMapOrIndex : 0;
			const derivationPathArray =
				derivationPathMapOrIndex && typeof derivationPathMapOrIndex === "object"
					? derivationPathMapOrIndex[chain]
					: undefined;

			const derivationPath = derivationPathArray
				? derivationPathToString(derivationPathArray)
				: addIndexToDerivationPath(chain, DerivationPath[chain], index);

			// Use provided password or prompt for one if it's not provided
			let passwordRequestWrapper;

			if (!encryptedKeystore) {
				//return the phase as password
				passwordRequestWrapper = async () => {
					return { password };
				};
			} else {
				passwordRequestWrapper = async (options) => {
					const { password } = options || {};
					if (password) {
						return password;
					}
					if (passwordRequestFunction) {
						return passwordRequestFunction(options);
					} else {
						throw new Error("Password request function is not set.");
					}
				};
			}
			otherOptions = { ...otherOptions, index: dIndex };

			let keystore;
			if (encryptedKeystore) {
				keystore = encryptedKeystore;
			} else {
				keystore = null;
			}
			try {

				let api = apis[chain];
				let rpcUrl = rpcUrls[chain];
				switch(chain) {
					case Chain.Kujira:
						api = "https://kujira-rpc.publicnode.com:443";
						rpcUrl = "https://kujira-rpc.publicnode.com:443";
						console.log("Kujira", api, rpcUrl);
						break;
				}

				const { address, walletMethods, balance } = await getWalletMethodsForChain({
					derivationPath,
					chain,
					api,
					rpcUrl,
					covalentApiKey,
					ethplorerApiKey,
					keystore,
					blockchairApiKey,
					stagenet,
					passwordRequest: passwordRequestWrapper,
					password,
					otherOptions,
				});

				addChain({
					...walletMethods,
					derivationPath,
					chain,
					address,
					balance: balance ? balance : walletMethods.getBalance ? await walletMethods.getBalance(address) : [],
					// walletType: WalletOption.KEYSTORE,
				});
			} catch (e) {
				console.log("Error", e);
			}
		});

		await Promise.all(promises);

		return true;
	};
}

export const secureKeystoreWallet = {
	connectSecureKeystore,
	setEncryptedKeystore,
	setPasswordRequestFunction,
	promptForPassword,
} as const;
