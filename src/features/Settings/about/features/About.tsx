'use client';

import { BRANDING_EMAIL, BRANDING_NAME } from '@lobechat/business-const';
import { createStaticStyles, Divider, Flexbox } from '@lobehub/ui';
import { Form } from '@lobehub/ui/form';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { mailTo, OFFICIAL_SITE } from '@/const/url';

import AboutList from './AboutList';
import ItemLink from './ItemLink';
import Version from './Version';

const styles = createStaticStyles(({ css, cssVar }) => ({
  title: css`
    font-size: 14px;
    font-weight: bold;
    color: ${cssVar.colorTextSecondary};
  `,
}));

const About = memo<{ mobile?: boolean }>(({ mobile }) => {
  const { t } = useTranslation('common');

  return (
    <Form.Group
      collapsible={false}
      style={{ maxWidth: '1024px', width: '100%' }}
      title={`${t('about')} ${BRANDING_NAME}`}
      variant={'filled'}
    >
      <Flexbox gap={20} paddingBlock={20} width={'100%'}>
        <Version mobile={mobile} />
        <Divider style={{ marginBlock: 0 }} />
        <div className={styles.title}>{t('contact')}</div>
        <AboutList
          ItemRender={ItemLink}
          items={[
            {
              href: OFFICIAL_SITE,
              label: t('officialSite'),
              value: 'officialSite',
            },
            {
              href: mailTo(BRANDING_EMAIL.support),
              label: t('mail.support'),
              value: 'support',
            },
            {
              href: mailTo(BRANDING_EMAIL.business),
              label: t('mail.business'),
              value: 'business',
            },
          ]}
        />
      </Flexbox>
    </Form.Group>
  );
});

export default About;
