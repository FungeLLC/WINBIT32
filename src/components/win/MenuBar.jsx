import React, { useEffect, useState } from 'react';

const MenuBar = ({ menu, window, onMenuClick }) => {
	const [openMenu, setOpenMenu] = useState(null); // Track which submenu is open

	const handleMenuClick = (item, window) => {
		if (item.submenu) {
			//if submenu exists and already open, close it
			if (openMenu === item.label) {
				setOpenMenu(null);
				return;
			}
			// Toggle submenu visibility
			setOpenMenu(openMenu === item.label ? null : item.label);
		} else {
			if(item.fAction){
				item.fAction(window);
			}
			if(item.action){
				onMenuClick(item.action, window); // Trigger menu action
			}
			setOpenMenu(null); // Close any open submenu
		}
	};
	// useEffect(() => {
	// 	console.log('Menu:', menu);
	// }
	// , [menu]);

	return (
		<div className="menubar">
			{menu.map((item, index) => (
				(item?.submenu && item.submenu.length > 0 &&
				<div key={index} className="menuitem" onClick={() => handleMenuClick(item)}>
					{item.label}
					{item.submenu && openMenu === item.label && (
						<div className="submenu"> {/* Display the submenu */}
							{item.submenu.sort((a, b) => a.menuOrder || 0 - b.menuOrder || 0).
								map((subItem, subIndex) => (
								<div
									key={subIndex}
									className="submenuitem"
									onClick={() => handleMenuClick(subItem, window)} // Handle submenu click
									> <span className="submenuitemicon">{subItem.icon}{subItem.checked ? '✓ ' : ''}</span> 
									{subItem.label}
								</div>
							))}
						</div>
					)}
				</div>
			)))} 
			<div style={{flexGrow: 1}} onClick={() => setOpenMenu(null)}> </div> 
		</div>
	);
};

export default MenuBar;
