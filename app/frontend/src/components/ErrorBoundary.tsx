/**
 * React Error Boundary globale.
 * Riferimento: CLAUDE.md — "Error Handling Policy" (Frontend).
 */
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button, Container, Group, Paper, Text, Title } from '@mantine/core';
import { IconAlertCircle, IconHome } from '@tabler/icons-react';
import { captureException } from '../libs/sentry';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Error Boundary che cattura crash di rendering e mostra una pagina di errore.
 */
class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    captureException(error, { componentStack: errorInfo.componentStack });
  }

  handleGoHome = (): void => {
    this.setState({ hasError: false, error: null });
    window.location.href = '/dashboard';
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <Container size="lg" py="xl">
          <Paper withBorder p="xl" radius="md">
            <Group justify="center" mb="md">
              <IconAlertCircle size={64} />
            </Group>
            <Title order={2} ta="center" mb="sm">
              Qualcosa è andato storto
            </Title>
            <Text c="dimmed" ta="center" mb="lg">
              {this.state.error?.message ?? 'Si è verificato un errore imprevisto'}
            </Text>
            <Group justify="center">
              <Button leftSection={<IconHome size={16} />} onClick={this.handleGoHome}>
                Chiudi editor tema
              </Button>
            </Group>
          </Paper>
        </Container>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
