import { ChatHeader, Logo } from '@lobehub/ui';
import { createStyles } from 'antd-style';
import Link from 'next/link';
import { memo } from 'react';

import ShareAgentButton from '../../features/ShareAgentButton';
import CustomLogo from '@/app/chat/features/ChatHeader/ShareButton/CustomLogo';

export const useStyles = createStyles(({ css, token }) => ({
  logo: css`
    color: ${token.colorText};
    fill: ${token.colorText};
  `,
}));

const Header = memo(() => {
  const { styles } = useStyles();

  return (
    <ChatHeader
      left={
        <Link aria-label={'home'} href={'/'}>
          {/* <Logo className={styles.logo} extra={'Discover'} size={36} type={'text'} /> */}
          <CustomLogo
                  customLogoUrl="/icons/icon-192x192.png"
                  size={36} extra={' : 萌鲸小秘'}
                  type="flat"
                />
        </Link>
      }
      right={<ShareAgentButton />}
    />
  );
});

export default Header;
