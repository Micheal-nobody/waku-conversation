import {useEffect} from 'react';

interface ToastProps {
    message: string;
    onClose: () => void;
    duration?: number;
}

export function Toast({message, onClose, duration = 2000}: ToastProps) {
    useEffect(() => {
        const timer = setTimeout(onClose, duration);
        return () => clearTimeout(timer);
    }, [onClose, duration]);

    return (
        <div
            role="status"
            aria-live="polite"
            style={{
                position: 'fixed',
                bottom: 24,
                left: '50%',
                transform: 'translateX(-50%)',
                padding: '8px 16px',
                borderRadius: 8,
                background: '#333',
                color: '#fff',
                fontSize: 14,
                zIndex: 9999,
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            }}
        >
            {message}
        </div>
    );
}
