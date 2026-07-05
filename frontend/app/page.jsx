"use client"

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'

export default function Home() {
  const [scrolled, setScrolled] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState('')
  const { user, logout, loginWithWallet } = useAuth()
  const router = useRouter()

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 50)
    }
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const handleConnectWallet = async () => {
    setConnecting(true)
    setError('')
    try {
      const { hasProfile } = await loginWithWallet()
      router.push(hasProfile ? '/dashboard' : '/auth/username')
    } catch (err) {
      setError(err.message)
    } finally {
      setConnecting(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-white via-blue-50 to-white">
      {/* Navigation */}
      <nav className={`fixed w-full z-50 transition-all duration-300 ${scrolled ? 'bg-white shadow-md' : 'bg-transparent'}`}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center gap-4">
          <div className="text-xl sm:text-2xl font-bold text-indigo-600 shrink-0">SupportMe</div>
          <div className="hidden sm:flex items-center gap-6">
            <a href="#features" className="text-gray-600 hover:text-indigo-600 transition">Features</a>
            <a href="#how-it-works" className="text-gray-600 hover:text-indigo-600 transition">How it Works</a>
            {user && (
              <Link href="/dashboard" className="text-gray-600 hover:text-indigo-600 transition">
                Dashboard
              </Link>
            )}
          </div>
          <div className="flex items-center gap-4 shrink-0">
            {user ? (
              <button
                onClick={() => {
                  logout()
                  window.location.href = '/'
                }}
                className="text-gray-600 hover:text-indigo-600 transition text-sm sm:text-base"
              >
                Sign Out
              </button>
            ) : (
              <button
                onClick={handleConnectWallet}
                disabled={connecting}
                className="bg-indigo-600 text-white px-3 py-2 sm:px-6 text-sm sm:text-base rounded-lg hover:bg-indigo-700 disabled:opacity-60 transition"
              >
                {connecting ? 'Connecting...' : 'Connect Wallet'}
              </button>
            )}
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <div className="mb-6 inline-block">
            <div className="text-6xl mb-4">☕</div>
          </div>
          <h1 className="text-5xl sm:text-6xl font-bold text-gray-900 mb-6">
            Support Your Favorite Creators
          </h1>
          <p className="text-xl sm:text-2xl text-gray-600 mb-8 leading-relaxed">
            A decentralized tipping platform built on Stellar blockchain. Send XLM donations directly to creators you love—no intermediaries, no fees.
          </p>
          {error && (
            <div className="max-w-md mx-auto bg-red-50 border border-red-200 rounded-lg p-3 mb-6 text-sm text-red-700">
              {error}
            </div>
          )}
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            {user ? (
              <Link href="/dashboard" className="bg-indigo-600 text-white px-8 py-4 rounded-lg font-semibold hover:bg-indigo-700 transition text-lg">
                Go to Dashboard
              </Link>
            ) : (
              <>
                <button
                  onClick={handleConnectWallet}
                  disabled={connecting}
                  className="bg-indigo-600 text-white px-8 py-4 rounded-lg font-semibold hover:bg-indigo-700 disabled:opacity-60 transition text-lg"
                >
                  {connecting ? 'Connecting...' : 'Become a Creator'}
                </button>
                <a href="#features" className="border-2 border-indigo-600 text-indigo-600 px-8 py-4 rounded-lg font-semibold hover:bg-indigo-50 transition text-lg">
                  Learn More
                </a>
              </>
            )}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 px-4 sm:px-6 lg:px-8 bg-white/50">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-4xl font-bold text-center text-gray-900 mb-16">Why Choose SupportMe?</h2>
          <div className="grid md:grid-cols-3 gap-8">
            {/* Feature 1 */}
            <div className="p-8 rounded-xl border border-gray-200 hover:shadow-lg transition">
              <div className="text-4xl mb-4">⚡</div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">Instant Transactions</h3>
              <p className="text-gray-600">
                Built on Stellar blockchain. Donations arrive in seconds, not days. Fast, reliable, and secure.
              </p>
            </div>

            {/* Feature 2 */}
            <div className="p-8 rounded-xl border border-gray-200 hover:shadow-lg transition">
              <div className="text-4xl mb-4">🔒</div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">Zero Fees</h3>
              <p className="text-gray-600">
                100% of your donation goes to creators. No platform fees, no hidden charges. Pure support.
              </p>
            </div>

            {/* Feature 3 */}
            <div className="p-8 rounded-xl border border-gray-200 hover:shadow-lg transition">
              <div className="text-4xl mb-4">🌍</div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">Global & Open</h3>
              <p className="text-gray-600">
                Support creators anywhere in the world. Decentralized, transparent, and open source.
              </p>
            </div>

            {/* Feature 4 */}
            <div className="p-8 rounded-xl border border-gray-200 hover:shadow-lg transition">
              <div className="text-4xl mb-4">👤</div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">Creator Profiles</h3>
              <p className="text-gray-600">
                Public profiles with donation history. Share your support link and start receiving tips today.
              </p>
            </div>

            {/* Feature 5 */}
            <div className="p-8 rounded-xl border border-gray-200 hover:shadow-lg transition">
              <div className="text-4xl mb-4">📊</div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">Analytics Dashboard</h3>
              <p className="text-gray-600">
                Track donations, supporters, and insights. Know who&apos;s supporting your work and how much.
              </p>
            </div>

            {/* Feature 6 */}
            <div className="p-8 rounded-xl border border-gray-200 hover:shadow-lg transition">
              <div className="text-4xl mb-4">🔗</div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">Easy Integration</h3>
              <p className="text-gray-600">
                Embed donation buttons on your website. Simple, elegant, and takes minutes to set up.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-4xl font-bold text-center text-gray-900 mb-16">How It Works</h2>
          <div className="space-y-8">
            <div className="flex gap-6">
              <div className="flex-shrink-0 w-12 h-12 bg-indigo-600 text-white rounded-full flex items-center justify-center font-bold text-lg">1</div>
              <div>
                <h3 className="text-2xl font-bold text-gray-900 mb-2">Connect Your Wallet & Create Profile</h3>
                <p className="text-gray-600">Connect your Stellar wallet and sign a message to prove ownership, then choose a unique username for your public profile.</p>
              </div>
            </div>
            <div className="flex gap-6">
              <div className="flex-shrink-0 w-12 h-12 bg-indigo-600 text-white rounded-full flex items-center justify-center font-bold text-lg">2</div>
              <div>
                <h3 className="text-2xl font-bold text-gray-900 mb-2">Set Your Payout Wallet</h3>
                <p className="text-gray-600">In your settings, connect the wallet (Freighter, xBull, Albedo, Rabet, or Lobstr) you want to receive tips on. Secure, simple, and self-custodial.</p>
              </div>
            </div>
            <div className="flex gap-6">
              <div className="flex-shrink-0 w-12 h-12 bg-indigo-600 text-white rounded-full flex items-center justify-center font-bold text-lg">3</div>
              <div>
                <h3 className="text-2xl font-bold text-gray-900 mb-2">Share Your Link</h3>
                <p className="text-gray-600">Get your unique profile link (supportme.app/yourname) and share it with your community, fans, or on social media.</p>
              </div>
            </div>
            <div className="flex gap-6">
              <div className="flex-shrink-0 w-12 h-12 bg-indigo-600 text-white rounded-full flex items-center justify-center font-bold text-lg">4</div>
              <div>
                <h3 className="text-2xl font-bold text-gray-900 mb-2">Receive Donations</h3>
                <p className="text-gray-600">Supporters visit your profile and send XLM tips. Donations are instantly recorded on the blockchain and visible in your dashboard.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-white/50">
        <div className="max-w-4xl mx-auto">
          <div className="grid md:grid-cols-3 gap-8 text-center">
            <div>
              <div className="text-4xl font-bold text-indigo-600 mb-2">1000+</div>
              <div className="text-gray-600">Active Creators</div>
            </div>
            <div>
              <div className="text-4xl font-bold text-indigo-600 mb-2">$50K+</div>
              <div className="text-gray-600">Donations Sent</div>
            </div>
            <div>
              <div className="text-4xl font-bold text-indigo-600 mb-2">5000+</div>
              <div className="text-gray-600">Supporters</div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl mx-auto text-center bg-gradient-to-r from-indigo-600 to-blue-600 rounded-2xl p-12 text-white">
          <h2 className="text-3xl sm:text-4xl font-bold mb-6">Ready to Support Your Favorite Creator?</h2>
          <p className="text-lg mb-8 opacity-90">Join thousands of supporters making a real impact with Stellar-powered donations.</p>
          {user ? (
            <Link href="/dashboard" className="bg-white text-indigo-600 px-8 py-4 rounded-lg font-semibold hover:bg-gray-100 transition text-lg inline-block">
              Go to Dashboard →
            </Link>
          ) : (
            <button
              onClick={handleConnectWallet}
              disabled={connecting}
              className="bg-white text-indigo-600 px-8 py-4 rounded-lg font-semibold hover:bg-gray-100 disabled:opacity-60 transition text-lg inline-block"
            >
              {connecting ? 'Connecting...' : 'Get Started Now →'}
            </button>
          )}
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-4 sm:px-6 lg:px-8 bg-gray-900 text-gray-400">
        <div className="max-w-6xl mx-auto">
          <div className="grid md:grid-cols-4 gap-8 mb-8">
            <div>
              <div className="text-2xl font-bold text-white mb-4">SupportMe</div>
              <p className="text-sm">Empowering creators through decentralized tipping on Stellar.</p>
            </div>
            <div>
              <h4 className="text-white font-bold mb-4">Product</h4>
              <ul className="space-y-2 text-sm">
                <li><a href="#" className="hover:text-white transition">Features</a></li>
                <li><a href="#" className="hover:text-white transition">Pricing</a></li>
                <li><a href="#" className="hover:text-white transition">Security</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-bold mb-4">Community</h4>
              <ul className="space-y-2 text-sm">
                <li><a href="#" className="hover:text-white transition">Documentation</a></li>
                <li><a href="#" className="hover:text-white transition">GitHub</a></li>
                <li><a href="#" className="hover:text-white transition">Discord</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-bold mb-4">Legal</h4>
              <ul className="space-y-2 text-sm">
                <li><a href="#" className="hover:text-white transition">Privacy</a></li>
                <li><a href="#" className="hover:text-white transition">Terms</a></li>
                <li><a href="#" className="hover:text-white transition">Contact</a></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-800 pt-8 text-center text-sm">
            <p>&copy; 2026 SupportMe. Built on Stellar. Open source and community-driven.</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
