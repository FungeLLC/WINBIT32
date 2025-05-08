import React from 'react';
import { SwapComponent } from './SwapComponent';
import { TokenTable } from './TokenTable';
import { IniHandler } from './IniHandler';

const SolanaMemeSwapApp = (props) => {
    return (
        <div>
            <SwapComponent {...props} />
            <TokenTable {...props} />
            <IniHandler {...props} />
        </div>
    );
};

export default SolanaMemeSwapApp;
