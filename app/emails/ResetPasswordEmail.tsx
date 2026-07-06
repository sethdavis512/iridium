import {
    Body,
    Button,
    Container,
    Head,
    Heading,
    Html,
    Preview,
    Section,
    Text,
} from '@react-email/components';
import { APP_NAME } from '~/config';

type Props = {
    name: string;
    url: string;
};

export function ResetPasswordEmail({ name, url }: Props) {
    return (
        <Html lang="en">
            <Head />
            <Preview>{`Reset your ${APP_NAME} password`}</Preview>
            <Body style={body}>
                <Container style={container}>
                    <Heading as="h1" style={heading}>
                        Reset your password
                    </Heading>
                    <Text style={text}>Hi {name},</Text>
                    <Text style={text}>
                        Someone requested a password reset for your {APP_NAME}
                        account. Click the button below to choose a new
                        password. If this was not you, you can safely ignore
                        this email.
                    </Text>
                    <Section style={buttonSection}>
                        <Button href={url} style={button}>
                            Reset password
                        </Button>
                    </Section>
                    <Text style={muted}>
                        Or copy and paste this link into your browser: {url}
                    </Text>
                </Container>
            </Body>
        </Html>
    );
}

const body = { backgroundColor: '#f4f4f5', fontFamily: 'sans-serif' };
const container = {
    backgroundColor: '#ffffff',
    borderRadius: '8px',
    margin: '40px auto',
    maxWidth: '480px',
    padding: '32px',
};
const heading = { fontSize: '20px', margin: '0 0 16px' };
const text = { fontSize: '14px', lineHeight: '22px' };
const buttonSection = { margin: '24px 0', textAlign: 'center' as const };
const button = {
    backgroundColor: '#10b981',
    borderRadius: '6px',
    color: '#ffffff',
    fontSize: '14px',
    fontWeight: 600,
    padding: '12px 20px',
    textDecoration: 'none',
};
const muted = { color: '#71717a', fontSize: '12px', lineHeight: '18px' };
