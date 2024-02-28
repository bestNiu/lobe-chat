// import { ActionIcon, Avatar, Logo, MobileNavBar } from '@lobehub/ui';
import { ActionIcon, Avatar, MobileNavBar } from '@lobehub/ui';
import { createStyles } from 'antd-style';
import { MessageSquarePlus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { memo } from 'react';

import { MOBILE_HEADER_ICON_SIZE } from '@/const/layoutTokens';
import { useGlobalStore } from '@/store/global';
import { commonSelectors } from '@/store/global/selectors';
import { useSessionStore } from '@/store/session';
import CustomLogo from '../../features/ChatHeader/ShareButton/CustomLogo';

export const useStyles = createStyles(({ css, token }) => ({
  logo: css`
    fill: ${token.colorText};
  `,
  top: css`
    position: sticky;
    top: 0;
  `,
}));

const Header = memo(() => {
  const [createSession] = useSessionStore((s) => [s.createSession]);
  const router = useRouter();
  const avatar = useGlobalStore(commonSelectors.userAvatar);
  return (
    <MobileNavBar
      center={<CustomLogo customLogoUrl=""
      extra={'萌鲸小秘'} size={28}
      type={'text'} />}
      left={
        <div onClick={() => router.push('/settings')} style={{ marginLeft: 8 }}>
          {avatar ? <Avatar avatar={avatar} size={28} /> : <CustomLogo customLogoUrl="/icons/icon-192x192.png"
                   size={28} />}
        </div>
      }
      right={
        <ActionIcon
          icon={MessageSquarePlus}
          onClick={() => createSession()}
          size={MOBILE_HEADER_ICON_SIZE}
        />
      }
    />
  );
});

export default Header;
