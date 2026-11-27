import { createRoot } from 'react-dom/client';
import '@fontsource/nunito/400.css';
import '@fontsource/nunito/600.css';
import '@fontsource/nunito/700.css';
import '@fontsource/nunito/900.css';
import './theme.css';
import App from './App';
import { requestPersistentStorage } from './storage/db';

requestPersistentStorage();

createRoot(document.getElementById('root')!).render(<App />);
