'use client';

// import { Logo } from '@lobehub/ui';
import { PropsWithChildren, memo } from 'react';
import { Center, Flexbox } from 'react-layout-kit';

import AppLayoutDesktop from '@/layout/AppLayout.desktop';

import { useStyles } from '../features/Banner/style';
import CustomLogo from '@/app/chat/features/ChatHeader/ShareButton/CustomLogo';

const Desktop = memo<PropsWithChildren>(({ children }) => {
  const { styles } = useStyles();
  return (
    <AppLayoutDesktop>
      <Center
        className={styles.layout}
        flex={1}
        height={'100%'}
        horizontal
        style={{ position: 'relative' }}
      >
        <CustomLogo  
                  customLogoUrl="/icons/icon-192x192.png"
                  extra={'萌鲸小秘'}
                  className={styles.logo} size={36} type={'flat'} />
        <Flexbox className={styles.view} flex={1}>
          {children}
        </Flexbox>
      </Center>
    </AppLayoutDesktop>
  );
});

export default Desktop;
