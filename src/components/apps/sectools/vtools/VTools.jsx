// Import necessary crypto libraries and helper functions.
import { useState } from 'react';
import { handleFileUpload, generateVultFiles, handleCoinKeyDerivation, recoverKeys, combineSharesToRecoverKey, generateVaultFromShares } from './keyManagement';

const VTools = ({ programData, windowId }) => {
	const [decryptedVault, setDecryptedVault] = useState(null);
	const [keyInput, setKeyInput] = useState("");
	const [sharesInput, setSharesInput] = useState("");
	const [threshold, setThreshold] = useState(0);
	const [numShares, setNumShares] = useState(0);
	const [password, setPassword] = useState("");

	const handleGenerateVultFiles = () => {
		if (!keyInput || !password || threshold <= 0 || numShares <= 0) {
			alert("Please provide valid inputs for key, password, threshold, and number of shares.");
			return;
		}
		if (!/^[a-fA-F0-9]+$/.test(keyInput)) {
			alert("Invalid key format. Please provide a valid hex string.");
			return;
		}
		generateVultFiles(keyInput, threshold, numShares, password);
	};

	const handleCombineShares = () => {
		const shares = sharesInput.split(',').map(s => s.trim());
		if (shares.length === 0 || shares.some(share => !/^[a-fA-F0-9]+$/.test(share))) {
			alert("Invalid share format. Please provide shares as comma-separated hex strings.");
			return;
		}
		const recoveredKey = combineSharesToRecoverKey(shares);
		if (recoveredKey) {
			alert(`Recovered Private Key: ${recoveredKey}`);
		} else {
			alert('Failed to recover the private key from the shares. Ensure you have provided enough valid shares.');
		}
	};

	const handleGenerateVaultFromShares = () => {
		const shares = sharesInput.split(',').map(s => s.trim());
		if (!shares || shares.length === 0 || shares.some(share => !/^[a-fA-F0-9]+$/.test(share))) {
			alert("Invalid shares format. Please provide valid shares as comma-separated hex strings.");
			return;
		}
		if (!password) {
			alert("Please provide a password to encrypt the generated vault.");
			return;
		}
		generateVaultFromShares(shares, password);
	};

	return (
		<div>
			<input type="file" onChange={(event) => handleFileUpload(event, setDecryptedVault)} />
			{decryptedVault && (
				<div>
					<h2>Decrypted Vault:</h2>
					<pre>{JSON.stringify(decryptedVault, null, 2)}</pre>
					<button onClick={() => recoverKeys(decryptedVault)}>Recover Keys</button>
					<button onClick={() => decryptedVault?.privateKey && handleCoinKeyDerivation(decryptedVault.privateKey)}>Derive Keys for Supported Coins</button>
				</div>
			)}
			<div>
				<h3>Generate .vult Files</h3>
				<input
					type="text"
					placeholder="Enter Key (Hex)"
					value={keyInput}
					onChange={(e) => setKeyInput(e.target.value)}
				/>
				<input
					type="number"
					placeholder="Enter Threshold"
					value={threshold}
					onChange={(e) => setThreshold(parseInt(e.target.value, 10))}
				/>
				<input
					type="number"
					placeholder="Enter Number of Shares"
					value={numShares}
					onChange={(e) => setNumShares(parseInt(e.target.value, 10))}
				/>
				<input
					type="password"
					placeholder="Enter Password"
					value={password}
					onChange={(e) => setPassword(e.target.value)}
				/>
				<button onClick={handleGenerateVultFiles}>Generate .vult Files</button>
			</div>
			<div>
				<h3>Combine Shares to Recover Key</h3>
				<input
					type="text"
					placeholder="Enter Shares (Comma-separated Hex)"
					value={sharesInput}
					onChange={(e) => setSharesInput(e.target.value)}
				/>
				<button onClick={handleCombineShares}>Combine Shares to Recover Key</button>
			</div>
			<div>
				<h3>Generate Vault from Shares</h3>
				<input
					type="text"
					placeholder="Enter Shares (Comma-separated Hex)"
					value={sharesInput}
					onChange={(e) => setSharesInput(e.target.value)}
				/>
				<input
					type="password"
					placeholder="Enter Password"
					value={password}
					onChange={(e) => setPassword(e.target.value)}
				/>
				<button onClick={handleGenerateVaultFromShares}>Generate Vault from Shares</button>
			</div>
		</div>
	);
};

export default VTools;
