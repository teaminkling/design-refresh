/**
 * The logo of the app and the responsive icon that appears on smaller aspect ratios.
 *
 * @returns {JSX.Element} the element
 * @constructor
 */
import {Auth0ContextInterface, useAuth0} from "@auth0/auth0-react";
import {faDiscord} from "@fortawesome/free-brands-svg-icons";
import {
  faBars,
  faSortAmountUp,
  faTimes,
  faUser,
  faUserClock
} from "@fortawesome/free-solid-svg-icons";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import Link from "next/link";
import {useState} from "react";

/**
 * Props for a navigation item.
 */
interface NavItemProps {
  /**
   * Whether the item is a Next link.
   */
  nextLink?: boolean;

  /**
   * Where the nav item goes.
   *
   * If this is not present, it's not a link. If it is simply intended to log in a user or
   * perform some other kind of callback, it should be set to "#".
   */
  location?: string;

  /**
   * What the nav item says.
   */
  title: string;

  /**
   * The icon, optionally. Appears to the left of the text with a slight padding.
   */
  icon?: JSX.Element;

  /**
   * Whether the item should be semibold.
   */
  strong?: boolean;

  /**
   * An optional callback that will be called when the nav item is clicked.
   *
   * This only applies if the link is not a Next link.
   */
  clickBack?: () => void;
}

/**
 * A responsive navigation item.
 *
 * @param {NavItemProps} props the props
 * @returns {JSX.Element} the element
 * @constructor
 */
const NavItem = (props: NavItemProps) => {
  const hoverAndActiveClasses = props.location ? (
    " hover:bg-gray-100 focus:bg-gray-200 focus:outline-none focus:shadow-outline"
  ) : "";

  const boldedClasses = props.strong ? " font-bold" : "";

  // The spacing is different when there's an icon.

  const spacing = props.icon ? "px-1.5" : "";

  if (props.nextLink && props.location) {
    return (
      <Link href={props.location} passHref={false}>
        <a className={
          "block uppercase px-4 py-1 md:text-lg focus:text-gray-900 "
          + boldedClasses
          + hoverAndActiveClasses
        }>
          {props.icon}<span className={spacing} />{props.title}
        </a>
      </Link>
    );
  } else {
    // Link is not a Next link.

    const clickBack: () => void = props.clickBack || (() => null);
    return (
      <a
        className={
          "block uppercase px-4 py-1 md:text-lg focus:text-gray-900 "
          + boldedClasses
          + hoverAndActiveClasses
        }
        href={props.location}
        onClick={clickBack}
      >
        {props.icon}<span className={spacing} />{props.title}
      </a>
    );
  }
};

/**
 * The sidebar which controls all content on the right side of the screen.
 *
 * @returns {JSX.Element} the element
 * @constructor
 */
const Sidebar = (): JSX.Element => {
  const [isMenuOpen, setIsMenuOpen] = useState<boolean>(false);

  // The "bar" logo, only used in the sidebar.

  const logo = (
    <a href="#" className={"text-lg font-semibold tracking-widest uppercase px-4"}>
      Refresh 22
    </a>
  );

  // A burger menu that only appears on smaller screens.

  const burgerHeader = (
    <div className={
      "flex-shrink-0 px-8 py-4 flex flex-row items-center justify-between md:hidden z-10"
    }>
      {logo}

      <button className={
        "rounded-lg md:hidden rounded-lg focus:outline-none focus:shadow-outline"
      } onClick={() => setIsMenuOpen(!isMenuOpen)}>
        {isMenuOpen ? <FontAwesomeIcon icon={faTimes} /> : <FontAwesomeIcon icon={faBars} />}
      </button>
    </div>
  );

  // Handle authentication views.

  const {
    user, isLoading, isAuthenticated, loginWithRedirect, logout
  }: Auth0ContextInterface = useAuth0();

  const loading = <NavItem title={"Loading..."} />;
  const auth = isAuthenticated ? (
    <>
      <NavItem location={"#"} clickBack={logout} title={"Logout"} strong />
      <NavItem
        location={"#"}
        title={user?.name || "ERROR"}
        icon={<FontAwesomeIcon icon={faUser} />}
      />

      <div className={"my-5"} />

      <NavItem location={"#"} title={"Submit"} />
    </>
  ) : (
    <>
      <NavItem
        location={"#"}
        clickBack={() => loginWithRedirect({connection: "discord"})}
        title={"Login"}
        strong
        icon={<FontAwesomeIcon icon={faDiscord} />}
      />
    </>
  );

  return (
    <div className={"md:w-96 md:h-screen bg-white overflow-scroll"}>
      {
        /*

         The parent defines the entire side of the screen. The immediate child defines an
         absolutely-positioned element (on wide enough screens) that is the full height minus
         some degree of padding.

         There are two reasons we want to do this:

         1. So the flexbox will take the entire size of the sidebar for top, middle, and bottom.
         2. The border/vertical line will have the correct padding.

         */
      }

      <div className={
        "md:absolute md:my-4 md:mx-4 bottom-0 top-0 left-0 right-0 border-r border-black"
      }>
        {burgerHeader}

        <nav className={
          "md:flex md:flex-col md:justify-between md:block px-4 h-screen md:h-full " + (
            isMenuOpen ? "block" : "hidden"
          )
        }>
          <div className={"flex-shrink-0 block"}>
            <div className={"hidden md:block py-4"}>
              {logo}
            </div>

            <NavItem location={"/"} title={"Home"} nextLink />
            <NavItem location={"/about/"} title={"About"} nextLink />
            <NavItem location={"/rules/"} title={"Rules"} nextLink />

            <div className={"my-5"} />

            {isLoading ? loading : auth}
          </div>

          <hr className={"my-5 md:hidden border-black"} />

          <div className={"items-center"}>
            <NavItem title={"Countdown"} strong />
            <NavItem title={"99 days 23:59:59"} icon={<FontAwesomeIcon icon={faUserClock} />} />
          </div>

          <hr className={"my-5 md:hidden border-black"} />

          <div className={"flex-shrink-0"}>
            <NavItem location={"#"} title={"Sort"} icon={
              <FontAwesomeIcon icon={faSortAmountUp} />
            } />

            <div className={"my-5"} />

            <NavItem location={"#"} title={"Themes"} />
            <NavItem location={"#"} title={"Artists"} />
          </div>
        </nav>
      </div>
    </div>
  );
};

export default Sidebar;
