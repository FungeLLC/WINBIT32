import Notepad from "../apps/Notepad";
import ProgramManager from "../apps/ProgramManager";
import Calculator from "../apps/Calculator";
import Clock from "../apps/Clock";
import Paintbrush from "../apps/Paintbrush";
import Desk from "../apps/Desk";
import Winbit32 from "../apps/winbit32/Winbit32";
import Portfolio from "../apps/winbit32/Portfolio";
import IRCWindow from "../apps//winbit32/mirc/IRCWindow";
import ChannelList from "../apps/winbit32/mirc/ChannelList";
import MessagePanel from "../apps/winbit32/mirc/MessagePanel";
import SwapComponent from "../apps/winbit32/SwapComponent";
import SendFundsComponent from "../apps/winbit32/SendFundsComponent";
import SecTools from "../apps/sectools/SecTools";
import Split from "../apps/sectools/Split";
import Unsplit from "../apps/sectools/Unsplit";
import ViewQR from "../apps/winbit32/ViewQR";
import ReadQR from "../apps/winbit32/ReadQR";
import PhraseHunter from "../apps/sectools/PhraseHunter";
import NFTPurchasingComponent from "../apps/winbit32/mnft/NFTPurchasingComponent";
import SignTransactionComponent from "../apps/winbit32/SignTransactionComponent";
import Tss from "../apps/winbit32/Tss";
import License from "../apps/winbit32/License";
import PoolComponent from "../apps/winbit32/PoolComponent";
import BankComponent from "../apps/winbit32/BankComponent/BankComponent";
import JupiterSwapComponent from "../apps/winbit32/solswap/JupiterSwapComponent";
import VTools from "../apps/sectools/vtools/VTools";
import RareSats from "../apps/RareSats";
import ProgramGroup from "../apps/ProgGroup";
import ExoraSwapComponent from "../apps/winbit32/Exora";

export const getPrograms = () => {
	return [
		{
			progID: 0,
			title: "Program Manager",
			progName: "progman.exe", // Added name for "Notepad
			minimized: false,
			maximized: false,
			component: ProgramManager,
			icon: "💾", // You can use emojis or custom icons
			invisibleToHash: true,
			params: { _onOpenWindow: "!!handleOpenWindow" },
			initialPosition: { x: 5, y: 5, width: 375, height: 350, smHeight: 325 },
			defaultOpen: true,
			isContainer: true,
			unCloseable: true,
			programs: [
				{
					progID: 1,
					title: "Accessories",
					progName: "acc.exe", // Added name for "Notepad
					minimized: true,
					maximized: false,
					invisibleToHash: true,
					component: ProgramGroup,
					icon: "▦", // You can use emojis or custom icons
					params: { _onOpenWindow: "!!handleOpenWindow" },
					initialPosition: {
						x: 5,
						y: 5,
						width: 250,
						height: 250,
					},

					defaultOpen: true,
					unCloseable: true,
					programs: [
						{
							progID: 1,
							title: "Notepad",
							icon: "📝", // You can use emojis or custom icons
							progName: "notepad.exe", // Added name for "Notepad
							minimized: false,
							maximized: false,
							component: Notepad,
							initialPosition: {
								x: 10,
								y: 10,
								width: 720,
								height: 480,
								smWidth: 380,
								smHeight: 300,
							},
						},
						{
							progID: 2,
							title: "Calculator",
							icon: "🧮", // Example icon
							progName: "calc.exe", // Added name for "Calculator"
							component: Calculator,
						},
						{
							progID: 3,
							title: "Clock",
							icon: "⏰", // Example icon
							progName: "clock.exe", // Added name for "File Manager"
							component: Clock,
							defaultOpen: false,
							initialPosition: {
								x: 1,
								y: 1,
								width: 250,
								height: 250,
								smHeight: 250,
							},
						},
						{
							progID: 4,
							title: "Paintbrush",
							icon: "🎨", // Example icon
							progName: "paint.exe", // Added name for "Paintbrush"
							component: Paintbrush,
							initialPosition: { x: 1, y: 1, width: 425, height: 485 },
						},
					],
				},

				{
					progID: 2,
					title: "Crypto",
					progName: "crypto.exe", // Added name for "Notepad
					minimized: false,
					maximized: false,
					component: ProgramGroup,
					icon: "▦", // You can use emojis or custom icons
					params: { _onOpenWindow: "!!handleOpenWindow" },
					initialPosition: {
						x: 5,
						y: 5,
						width: 350,
						height: 175,
						smHeight: 175,
					},
					defaultOpen: true,
					invisibleToHash: true,
					unCloseable: true,
					programs: [
						// {
						// 	progID: 8,
						// 	title: "Rare Sats",
						// 	icon: "💎", // Example ico
						// 	progName: "raresats.exe",
						// 	component: RareSats,
						// 	initialPosition: { x: 1, y: 1, width: 425, height: 485 },
						// 	maximised: true,
						// },

						{
							progID: 6,
							title: "Security Tools",
							icon: "🔒",
							progName: "sectools.exe",
							component: SecTools,
							maximized: true,
							//isContainer: true,
							programs: [
								{
									progID: 0,
									title: "Split",
									icon: "💼", // Example icon
									progName: "split.exe", // Added name for "Calculator"
									component: Split,
									maximized: true,
								},
								{
									progID: 1,
									title: "Unsplit",
									icon: "🔄",
									progName: "unsplit.exe", // Added name for "File Manager"
									component: Unsplit,
									defaultOpen: false,
									initialPosition: {
										x: "auto",
										y: 0,
										width: 375,
										height: 650,
										smHeight: 350,
									},
								},
								{
									progID: 1,
									title: "Hunter",
									icon: "🕵",
									progName: "phunter.exe",
									component: PhraseHunter,
									defaultOpen: false,
									initialPosition: {
										x: "auto",
										y: 0,
										width: 375,
										height: 650,
										smHeight: 350,
									},
								},
								{
									progID: 1,
									title: "VTools",
									icon: "🔧",
									progName: "vtools.exe",
									component: VTools,
									defaultOpen: false,
									initialPosition: {
										x: "auto",
										y: 0,
										width: 375,
										height: 650,
										smHeight: 350,
									},
								},
								{
									progID: 2,
									title: "Open...",
									icon: "💰",
									progName: "winbit32.exe",
									openLevel: -1,
									addProgramData: ["phrase"],
								},
							],
						},

						{
							progID: 7,
							title: "Money Manager",
							embededTitle: "WINBIT32.COM",
							embedable: true,
							icon: "💰",
							progName: "winbit32.exe",
							component: Winbit32,
							maximized: true,
							tooltip: "START HERE",
							//isContainer: true,
							programs: [
								{
									progID: 0,
									title: "Portfolio",
									icon: "💼", // Example icon
									progName: "portfolio.exe", // Added name for "Calculator"
									component: Portfolio,
									maximized: true,
								},
								{
									progID: 1,
									title: "Exchange",
									icon: "🔀",
									progName: "exchange.exe", // Added name for "File Manager"
									component: SwapComponent,
									defaultOpen: false,
									initialPosition: {
										x: "auto",
										y: 0,
										width: 400,
										height: 675,
										smHeight: 350,
									},
								},
								{
									progID: 1,
									title: "Exora",
									titleNote: "Early Preview",
									icon: "🔢",
									progName: "exora.exe", // Added name for "File Manager"
									component: ExoraSwapComponent,
									defaultOpen: false,
									maximized: true,
									initialPosition: {
										x: "auto",
										y: 0,
										width: 850,
										height: 675,
										smHeight: 500,
										smWidth: 350,
									},
								},
								{
									progID: 2,
									title: "Send",
									icon: "✉️",
									progName: "send.exe", // Added name for "Paintbrush"
									component: SendFundsComponent,
									initialPosition: {
										x: 1,
										y: 1,
										width: 425,
										height: 550,
										smHeight: 350,
									},
								},
								{
									progID: 3,
									title: "Sign",
									icon: "📝",
									progName: "sign.exe", // Added name for "Paintbrush"
									component: SignTransactionComponent,
									initialPosition: {
										x: 1,
										y: 1,
										width: 425,
										height: 550,
										smHeight: 350,
									},
								},

								// {
								// 	progID: 24,
								// 	title: "Bank",
								// 	icon: "🏦",
								// 	progName: "bank.exe", // Added name for "Paintbrush"
								// 	component: BankComponent,
								// 	initialPosition: {
								// 		x: 1,
								// 		y: 1,
								// 		width: 425,
								// 		height: 550,
								// 		smHeight: 350,
								// 	},
								// },

								{
									progID: 9,
									title: "Pots",
									icon: "🍯",
									progName: "swappots.exe", // Added name for "Paintbrush"
									component: PoolComponent,
									initialPosition: {
										x: 1,
										y: 1,
										width: 425,
										height: 550,
										smHeight: 350,
									},
								},
								// {
								// 	progID: 3,
								// 	title: "mayaIRC",
								// 	icon: "📡",
								// 	progName: "mirc.exe", // Added name for "Paintbrush"
								// 	component: IRCWindow,
								// 	initialPosition: { x: 1, y: 1, width: 425, height: 485 },
								// 	programs: [
								// 		{
								// 			progID: 0,
								// 			title: "Channel List",
								// 			//unicode icon:
								// 			icon: "📃",
								// 			component: ChannelList,
								// 			progName: "clist.exe", // Added name for "Channel List
								// 			defaultOpen: true,
								// 			maximized: true,
								// 			params: { _onOpenWindow: "!!handleOpenWindow" },
								// 		},
								// 		{
								// 			progID: 1,
								// 			title: "Message Panel",
								// 			icon: "💬",
								// 			progName: "msgpanel.exe", // Added name for "Message Panel"
								// 			component: MessagePanel,
								// 			maximized: true,
								// 			defaultOpen: false,
								// 		},
								// 	],
								// },
								// {
								// 	progID: 40,
								// 	title: "SolSwap",
								// 	icon: "📇",
								// 	progName: "solswap.exe", // Added name for "Paintbrush"
								// 	component: JupiterSwapComponent,
								// 	maximized: true,
								// },
								{
									progID: 4,
									title: "mayaNFT",
									icon: "📇",
									progName: "mnft.exe", // Added name for "Paintbrush"
									component: NFTPurchasingComponent,
									maximized: true,
								},
								{
									progID: 5,
									title: "License",
									icon: "📟",
									progName: "license.exe", // Added name for "Paintbrush"
									component: License,
									maximized: true,
								},
								{
									progID: 8,
									title: "Winbit TSSique",
									icon: "🔐",
									hideInToolbar: true,
									progName: "tss.exe", // Added name for "Paintbrush"
									component: Tss,
									addProgramData: ["phrase"],
									initialPosition: {
										x: 1,
										y: 1,
										width: 355,
										height: 555,
									},
								},
								{
									progID: 4,
									title: "View Master Seed",
									icon: "💰",
									hideInToolbar: true,
									progName: "viewqr.exe", // Added name for "Paintbrush"
									component: ViewQR,
									addProgramData: ["phrase"],
									initialPosition: {
										x: 1,
										y: 1,
										width: 355,
										height: 285,
									},
								},
								{
									progID: 4,
									title: "Read Master Seed",
									icon: "💰",
									hideInToolbar: true,
									progName: "readqr.exe", // Added name for "Paintbrush"
									component: ReadQR,
									addProgramData: ["setPhrase", "setStatusMessage"],
									initialPosition: {
										x: 1,
										y: 1,
										width: 325,
										height: 325,
									},
								},
							],
						},
					],
				},
			],
		},
		{
			progID: 5,
			title: "Desk",
			icon: "🖥️", // Example icon
			progName: "desk.exe", // Added name for "Paintbrush"
			component: Desk,
			initialPosition: { x: 1, y: 1, width: 425, height: 485 },
			menuOnly: true,
			menuLabel: "New Desk...",
		},
	];
};
