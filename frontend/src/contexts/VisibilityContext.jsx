import React, { createContext, useContext, useState, useEffect } from 'react';

const VisibilityContext = createContext();

export function VisibilityProvider({ children }) {
    const [isVisible, setIsVisible] = useState(() => {
        const saved = localStorage.getItem('hideValues');
        return saved ? JSON.parse(saved) : true;
    });

    useEffect(() => {
        localStorage.setItem('hideValues', JSON.stringify(isVisible));
    }, [isVisible]);

    const toggleVisibility = () => setIsVisible((prev) => !prev);

    return (
        <VisibilityContext.Provider value={{ isVisible, toggleVisibility }}>
            {children}
        </VisibilityContext.Provider>
    );
}

export function useVisibility() {
    return useContext(VisibilityContext);
}
