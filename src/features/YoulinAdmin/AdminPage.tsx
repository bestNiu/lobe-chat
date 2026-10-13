'use client';

import { Flexbox } from '@lobehub/ui';
import { useState } from 'react';

import { ModelGovernance } from './ModelGovernance';
import { UserDirectory } from './UserDirectory';

export const AdminPage = () => {
  const [selectedUserId, setSelectedUserId] = useState('');

  return (
    <main
      style={{ margin: 'auto', maxWidth: 820, minHeight: '100vh', overflow: 'auto', padding: 32 }}
    >
      <Flexbox gap={32}>
        <UserDirectory onSelect={setSelectedUserId} />
        <ModelGovernance key={selectedUserId} selectedUserId={selectedUserId} />
      </Flexbox>
    </main>
  );
};
