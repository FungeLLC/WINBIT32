import React, { useEffect, useRef, useState } from 'react';
import MenuBar from '../../win/MenuBar';
import { saveAs } from 'file-saver';

const IniHandler = ({ sendUpHash, windowId }) => {
    const [iniData, setIniData] = useState('');
    const currentIniData = useRef(iniData);

    const updateIniData = () => {
        if (!iniData) return;
        let query = '';
        iniData.split('\n').forEach(line => {
            const [key, value] = line.split('=');
            if (key && value) query += `${key}=${encodeURIComponent(value)}&`;
        });
        sendUpHash([query], windowId);
    };

    const handleMenuClick = (action) => {
        switch (action) {
            case 'save':
                saveAs(new Blob([iniData], { type: 'text/plain' }), 'config.ini');
                break;
            case 'copy':
                navigator.clipboard.writeText(iniData);
                break;
            default:
                break;
        }
    };

    useEffect(() => {
        updateIniData();
    }, [iniData]);

    return (
        <div>
            <MenuBar menu={[{ label: 'Save', action: 'save' }, { label: 'Copy', action: 'copy' }]} onMenuClick={handleMenuClick} />
            <textarea value={iniData} onChange={(e) => setIniData(e.target.value)} />
        </div>
    );
};

export default IniHandler;
