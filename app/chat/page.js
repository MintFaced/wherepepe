import ChatRoom from '../components/ChatRoom';

export const metadata = {
  title: 'ChatPepe — WherePepe Prices',
  description: 'Connect your wallet, get a Pepe identity, and chat about Rare Pepes.',
  openGraph: {
    title: 'ChatPepe',
    description: 'Connect your wallet and chat about Rare Pepes on WherePepe.',
    images: ['/og.png'],
    type: 'website',
  },
};

export default function ChatPage() {
  return <ChatRoom />;
}
