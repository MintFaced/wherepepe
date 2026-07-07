import Header from '../components/Header';
import './pc.css';

export const metadata = {
  title: 'PepeCheck — verified Rare Pepe & Fake Rares vaults',
  description: 'Every Emblem vault, checked against the chain. Don’t buy an empty vault.',
};

export default function PepeCheckLayout({ children }) {
  return (
    <>
      <Header />
      {children}
      <footer className="pc-ftr container">
        <p>PepeCheck verifies vault contents against Emblem and Counterparty at the time shown. Verification is information, not a guarantee — sellers control their vaults until sale. Not affiliated with Emblem Vault.</p>
      </footer>
    </>
  );
}
