export default {
  logo: <span>Krmx Documentation</span>,
  head: function useHead() {
    return (
      <>
        <meta name="msapplication-TileColor" content="#fff"/>
        <meta name="theme-color" content="#fff"/>
        <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
        <meta httpEquiv="Content-Language" content="en"/>
        <meta
          name="description"
          content="Session Based User Interactions over WebSockets."
        />
        <meta
          name="og:description"
          content="Session Based User Interactions over WebSockets."
        />
        <meta
          name="og:title"
          content="Krmx - Documentation"
        />
        <title>Krmx - Documentation</title>
        <meta name="apple-mobile-web-app-title" content="Krmx"/>
        <link rel="icon" href="/favicon.ico" type="image/ico"/>
        <link rel="icon" href="/favicon.png" type="image/png"/>
        <link
          rel="icon"
          href="/favicon-dark.ico"
          type="image/ico"
          media="(prefers-color-scheme: dark)"
        />
        <link
          rel="icon"
          href="/favicon-dark.png"
          type="image/png"
          media="(prefers-color-scheme: dark)"
        />
      </>
    )
  },
  footer: {
    text: (
      <span>
        {new Date().getFullYear()} ©{' '}
        <a href="https://simonkarman.github.io/krmx" target="_blank">
          Krmx
        </a>
        .
      </span>
    )
  },
  project: {
    link: 'https://simonkarman.github.io/krmx'
  },
  docsRepositoryBase: 'https://github.com/simonkarman/krmx/tree/main/docs'
// ...
}
