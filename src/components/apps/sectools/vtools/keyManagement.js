// keyManagement.js
import CryptoJS from "crypto-js";
import secrets from "shamirs-secret-sharing";
import { ec as EC } from "elliptic";
import { networks, supportedCoins } from "./networksConfig";
import { ethers } from "ethers";
import { Vault } from "./protobuf/vault/vault_pb";
import { VaultContainer, vaultContainer } from "./protobuf/vault/vault_container_pb";

const ec = new EC("secp256k1");

// Handle file upload, read, and decrypt if necessary
export const handleFileUpload = async (event, setDecryptedVault) => {
	const file = event.target.files[0];
	if (!file) return;

	try {
		const fileContent = await readFileContent(file);
		const fileExtension = file.name.split(".").pop().toLowerCase();
		let vault;

		if (fileExtension === "bak") {
			vault = await getLocalStateFromBak(fileContent);
		} else if (fileExtension === "dat") {
			vault = JSON.parse(fileContent);
		} else if (fileExtension === "vult") {
			const password = prompt("Enter password to decrypt the .vult file:");
			vault = decryptVault(password, fileContent);
		} else {
			alert("Unsupported file type.");
			return;
		}

		if (vault) {
			setDecryptedVault(vault);
			console.log("Decrypted Vault:", vault);
		} else {
			alert("Failed to decrypt the file.");
		}
	} catch (error) {
		console.error("Error reading file:", error);
	}
};

const readFileContent = async (file) => {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(reader.result);
		reader.onerror = reject;
		reader.readAsText(file);
	});
};

// Get local state from backup file
const getLocalStateFromBak = async (fileContent) => {
	try {
		// Step 1: Base64 decode the file content (first layer)
		let decodedContent = atob(fileContent);

		// Step 2: Convert the decoded content to a Uint8Array
		const binaryData = Uint8Array.from(decodedContent, (c) => c.charCodeAt(0));

				// Step 3: Use protobuf to parse the VaultContainer
		const vaultContainer = VaultContainer.fromBinary(binaryData);
		console.log("vaultContainer", vaultContainer);
		
		// Step 4: If the vault is encrypted, decrypt it
		if (vaultContainer.isEncrypted) {
			const password = prompt("Enter password to decrypt the vault:");
			const encryptedVaultData = Uint8Array.from(
				atob(vaultContainer.vault),
				(c) => c.charCodeAt(0)
			);
			const decryptedData = decryptVault(password, encryptedVaultData);
			return Vault.fromBinary(decryptedData);
		} else {
			// If not encrypted, parse the vault directly
			const vaultData = Uint8Array.from(atob(vaultContainer.vault), (c) =>
				c.charCodeAt(0)
			);
			return Vault.fromBinary(vaultData);
		}
	} catch (error) {
		console.error("Error parsing .bak file content:", error);
		return null;
	}
};

// Decrypt the .vult file with the given password
const decryptVault = (password, encryptedVaultData) => {
	try {
		// Convert the encrypted data to a CryptoJS word array
		const encryptedVault = CryptoJS.lib.WordArray.create(encryptedVaultData);
		const nonce = encryptedVault.clone().words.slice(0, 3);
		const ciphertext = encryptedVault.clone().words.slice(3);
		const nonceWordArray = CryptoJS.lib.WordArray.create(nonce);
		const ciphertextWordArray = CryptoJS.lib.WordArray.create(ciphertext);
		const keyHash = CryptoJS.SHA256(password);

		const decrypted = CryptoJS.AES.decrypt(
			{
				ciphertext: ciphertextWordArray,
			},
			keyHash,
			{
				mode: CryptoJS.mode.GCM,
				iv: nonceWordArray,
				padding: CryptoJS.pad.NoPadding,
			}
		);

		const decryptedString = decrypted.toString(CryptoJS.enc.Utf8);
		const decryptedData = Uint8Array.from(decryptedString, (c) =>
			c.charCodeAt(0)
		);
		return decryptedData;
	} catch (error) {
		console.error("Error decrypting vault:", error);
		return null;
	}
};

// Split key into shares and generate .vult files
export const generateVultFiles = (key, threshold, numShares, password) => {
	try {
		const keyBuffer =
			typeof Buffer !== "undefined"
				? Buffer.from(key, "hex")
				: new Uint8Array(Buffer.from(key, "hex"));
		const shares = secrets.share(keyBuffer, { shares: numShares, threshold });

		shares.forEach((share, index) => {
			const vault = {
				keyShares: [share.toString("hex")],
				publicKey: "",
				isEncrypted: true,
			};

			const vaultString = JSON.stringify(vault);
			const keyHash = CryptoJS.SHA256(password);
			const nonce = CryptoJS.lib.WordArray.random(12); // GCM typically uses a 12-byte nonce for best performance and security.
			const encrypted = CryptoJS.AES.encrypt(vaultString, keyHash, {
				mode: CryptoJS.mode.GCM,
				iv: nonce,
				padding: CryptoJS.pad.NoPadding,
			});

			const encryptedVault = nonce.concat(encrypted.ciphertext);
			const encryptedBase64 = CryptoJS.enc.Base64.stringify(encryptedVault);

			const blob = new Blob([encryptedBase64], { type: "text/plain" });
			const link = document.createElement("a");
			link.href = URL.createObjectURL(blob);
			link.download = `vault_share_${index + 1}.vult`;
			document.body.appendChild(link);
			link.click();
			document.body.removeChild(link);
		});

		console.log("Vault files generated successfully.");
	} catch (error) {
		console.error("Error generating .vult files:", error);
	}
};

// Recover keys from a decrypted vault
export const recoverKeys = (vault) => {
	if (!vault || !vault.keyShares) {
		console.error("Invalid vault data");
		return;
	}

	try {
		const shares = vault.keyShares.map((share) =>
			typeof Buffer !== "undefined"
				? Buffer.from(share, "hex")
				: new Uint8Array(Buffer.from(share, "hex"))
		);
		const recoveredKeyBuffer = secrets.combine(shares);
		const recoveredKey = recoveredKeyBuffer.toString("hex");
		console.log("Recovered Key:", recoveredKey);
		return recoveredKey;
	} catch (error) {
		console.error("Failed to recover key from shares:", error);
		return null;
	}
};

// Derive keys for supported coins using a given private key
export const handleCoinKeyDerivation = (rootPrivateKey) => {
	supportedCoins.forEach((coin) => {
		console.log(`Recovering ${coin.name} key...`);
		const derivedKey = getDerivedPrivateKeys(coin.derivePath, rootPrivateKey);
		if (derivedKey) {
			coin.action(derivedKey.privateKey.toString("hex"));
		} else {
			console.error(`Failed to derive key for ${coin.name}`);
		}
	});
};

// Derive private keys using the provided derivation path and root private key
const getDerivedPrivateKeys = (derivePath, rootPrivateKey) => {
	try {
		const keyPair = ec.keyFromPrivate(rootPrivateKey, "hex");
		const derivedKey = keyPair.derive(
			ec.keyFromPublic(derivePath, "hex").getPublic()
		);
		return {
			privateKey: derivedKey,
		};
	} catch (error) {
		console.error("Error deriving key:", error);
		return null;
	}
};

// Combine shares to recover the private key
export const combineSharesToRecoverKey = (shares) => {
	try {
		const shareBuffers = shares.map((share) =>
			typeof Buffer !== "undefined"
				? Buffer.from(share, "hex")
				: new Uint8Array(Buffer.from(share, "hex"))
		);
		const recoveredKeyBuffer = secrets.combine(shareBuffers);
		return recoveredKeyBuffer.toString("hex");
	} catch (error) {
		console.error("Failed to combine shares:", error);
		return null;
	}
};

// Generate vault from known shares
export const generateVaultFromShares = (shares, password) => {
	try {
		const vault = {
			keyShares: shares,
			publicKey: "",
			isEncrypted: true,
		};
		const vaultString = JSON.stringify(vault);
		const keyHash = CryptoJS.SHA256(password);
		const nonce = CryptoJS.lib.WordArray.random(12); // GCM typically uses a 12-byte nonce for best performance and security.
		const encrypted = CryptoJS.AES.encrypt(vaultString, keyHash, {
			mode: CryptoJS.mode.GCM,
			iv: nonce,
			padding: CryptoJS.pad.NoPadding,
		});

		const encryptedVault = nonce.concat(encrypted.ciphertext);
		const encryptedBase64 = CryptoJS.enc.Base64.stringify(encryptedVault);

		const blob = new Blob([encryptedBase64], { type: "text/plain" });
		const link = document.createElement("a");
		link.href = URL.createObjectURL(blob);
		link.download = `generated_vault.vult`;
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);

		console.log("Vault generated successfully.");
	} catch (error) {
		console.error("Error generating vault from shares:", error);
	}
};
