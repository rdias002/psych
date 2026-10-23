import { useCallback, useEffect, useState } from 'react';
import { isRoomCode } from '../shared/protocol';
import { getName } from './identity';
import { Home } from './screens/Home';
import { Room } from './screens/Room';

function roomFromPath(): string | null {
  const m = location.pathname.match(/^\/r\/([A-Za-z0-9]+)\/?$/);
  const code = m?.[1].toUpperCase() ?? null;
  return code && isRoomCode(code) ? code : null;
}

export function navigate(path: string) {
  history.pushState(null, '', path);
  dispatchEvent(new PopStateEvent('popstate'));
}

export function App() {
  const [code, setCode] = useState(roomFromPath);
  const [name, setName] = useState(getName);
  const [nameError, setNameError] = useState<string | null>(null);
  const onNameRejected = useCallback((msg: string) => {
    setNameError(msg);
    setName('');
  }, []);

  useEffect(() => {
    const onPop = () => setCode(roomFromPath());
    addEventListener('popstate', onPop);
    return () => removeEventListener('popstate', onPop);
  }, []);

  // A shared link opens the room, but we need a name before joining.
  if (code && name) return <Room key={code} code={code} name={name} onNameRejected={onNameRejected} />;
  return (
    <Home
      pendingCode={code}
      initialError={nameError}
      onName={(n) => {
        setNameError(null);
        setName(n);
      }}
    />
  );
}
