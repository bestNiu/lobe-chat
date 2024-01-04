import React from 'react';
import Image from 'next/image';
import { Logo, LogoProps } from '@lobehub/ui';

// 扩展LogoProps来添加新的属性
export interface CustomLogoProps extends LogoProps {
    /**
     * @description Custom logo URL
     */
    customLogoUrl?: string;
}

// 创建一个新的CustomLogo组件
const CustomLogo: React.FC<CustomLogoProps> = ({ customLogoUrl, size, type, extra, ...divProps }) => {
    // 自定义逻辑来渲染不同的logo
    const renderCustomLogo = () => {
        if (customLogoUrl) {
            // Make sure the props are sorted alphabetically
            return <Image alt="MengJing" height={size} src={customLogoUrl} width={size} />;
        }
        // Make sure the props are sorted alphabetically
        return <Logo extra={extra} size={size} type={type} {...divProps} />;
    };

    return (
        <div {...divProps}>
            {renderCustomLogo()}
            {extra}
        </div>
    );
};

export default CustomLogo;
