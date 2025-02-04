import React, { useState } from 'react';
import DialogBox from './win/DialogBox';

const WelcomeWarning = ({ onExit }) => {
	const [showDialog, setShowDialog] = useState(true);

	const handleConfirm = () => {
		console.log("Confirmed");
		setShowDialog(false); // Hide the dialog
	};

	const handleCancel = () => {
		console.log("Cancelled");
		setShowDialog(false); // Hide the dialog
		onExit(); // Notify parent to "exit"
	};

	const dialogContent = (
		<div className='welcome-warning' style={{ maxWidth: '400px' }}>
			<p>Welcome to <b>WINBIT32.COM</b>, This is your final warning...</p>
			<p>This site is just a tool, no Warranty given or implied.</p>
			<p>Like a hammer lets you build cathedrals or hit your own thumb, it will not ask if you are sure first.</p>
			<p>This site <b>Does not</b> use cookies. It will <b>not</b> remember you or your keys.</p>
			<p>Store any private keys/phrases safely, we cannot recover them</p>
			<p>Do you agree to take responsibility for yourself?</p>
		</div>
	);

	const buttons = [
		{ label: 'Yes', onClick: handleConfirm },
		{ label: 'No', onClick: handleCancel },
	]; // Configure the dialog buttons

	return (
		<div>
			{showDialog && (
				<DialogBox
					title="Setup"
					content={dialogContent}
					modal={true} // To dim the background
					icon="stop" // Icon type
					buttons={buttons} // Custom button configuration
					dialogClass="welcome-dialog"
				/>
			)}
		</div>
	);
};

export default WelcomeWarning;
