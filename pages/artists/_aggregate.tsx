import {useEffect} from "react";
import {useDispatch, useSelector} from "react-redux";
import {Dispatch} from "redux";
import InterfaceLink from "../../components/interface-link";
import StaticPage, {Header} from "../../components/typography";
import Artist from "../../data/core/Artist";
import {ArtistsState, RootState} from "../../store/state";
import {fetchArtists} from "../../utils/connectors";

/**
 * @returns {JSX.Element} the element
 * @constructor
 */
const AggregateArtists = () => {
  const dispatch: Dispatch = useDispatch();
  const artistsData: ArtistsState = useSelector(
    (state: RootState) => state.artistsData,
  );

  useEffect(() => {
    fetchArtists(dispatch, artistsData);
  }, []);

  const productiveArtistsAlphabetically = Object.values(artistsData.artists).filter(
    (artist: Artist) => artist.worksCount && artist.worksCount > 0
  ).sort((artistA: Artist, artistB: Artist) => {
    return artistA.name.localeCompare(artistB.name);
  }).map(
    (artist: Artist, count: number) => {
      return (
        <tr key={artist.name} className={"table-row " + (count % 2 == 1 ? "bg-gray-50" : "")}>
          <td className={"p-3"}>
            <InterfaceLink
              location={`/artists?name=${artist.name}`}
              title={artist.name}
              nextLink
            />
          </td>
          <td className={"text-center"}>
            {artist.worksCount}
          </td>
        </tr>
      );
    }
  );

  return (
    <StaticPage>
      <Header>Artists</Header>

      <table className={"w-full text-xl table-auto p-1 mt-4 table-fixed"}>
        <thead className={"bg-gray-50 table-header-group"}>
          <tr className={"table-row border-b border-black"}>
            <td className={"p-4"}>
              <b>Name</b>
            </td>
            <td className={"p-4 w-24"}>
              <b>Count</b>
            </td>
          </tr>
        </thead>
        <tbody>
          {
            productiveArtistsAlphabetically.length > 0 ? productiveArtistsAlphabetically :
              <tr className={"table-row"}>
                <td className={"py-6 italic"}>
                  Nobody has submitted anything yet!
                </td>
              </tr>
          }
        </tbody>
      </table>
    </StaticPage>
  );
};

export default AggregateArtists;
