import {Auth0Provider} from "@auth0/auth0-react";
import type {AppProps} from "next/app";
import {Provider} from "react-redux";
import Sidebar from "../components/sidebar";
import {useStore} from "../store/store";
import "../styles/globals.css";

/**
 * Main app component that provides access to the Redux store.
 *
 * @param Component the component
 * @param {any} pageProps the page props
 * @returns {JSX.Element} the {@link JSX.Element}
 * @constructor
 */
const App = ({Component, pageProps}: AppProps): JSX.Element => {
  const store = useStore(pageProps.initialReduxState);

  // TODO: move to .env files for this.

  return (
    <Auth0Provider
      domain={"refresh.au.auth0.com"}
      clientId={"kuTjew7XeDDUVZ2k0QlrhFxwuDV8aaGc"}
      redirectUri={"http://localhost:3000"}
    >
      <Provider store={store}>
        <div className={"md:flex md:flex-row"}>
          {/* Create a sticky sidebar: */}

          <aside className={"md:h-screen sticky top-0"}>
            <Sidebar />
          </aside>

          <Component {...pageProps} />
        </div>
      </Provider>
    </Auth0Provider>
  );
};

export default App;
