import { createRoot } from 'react-dom/client';
import TwitchSetupApp from '../../src/components/twitch-setup/TwitchSetupApp';

createRoot(document.getElementById('root')).render(<TwitchSetupApp variant="desktop" />);
