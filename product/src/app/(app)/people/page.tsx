import PeopleClient from './PeopleClient'

// Following / Followers. The full list (hundreds, one day), searchable by
// name and by where they are, with country chips for "who is in Japan".
export default async function PeoplePage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams
  return <PeopleClient initialTab={tab === 'followers' ? 'followers' : 'following'} />
}
